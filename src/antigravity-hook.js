/*
 * Copyright 2026 Darshan
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callHookBridge } from './hook-bridge.js';
import { evaluateHostVerdict } from './host-gate.js';

const CONFIG = fileURLToPath(new URL('../.local/antigravity-demo.json', import.meta.url));
const PENDING = fileURLToPath(new URL('../.local/antigravity-pending', import.meta.url));
const COMMANDS = new Set(['ls', 'cat', 'touch', 'rm', 'npm']);
const FILE_PATH_FIELD = {
  view_file: 'AbsolutePath',
  list_dir: 'DirectoryPath',
  find_by_name: 'SearchDirectory',
  grep_search: 'SearchPath',
  write_to_file: 'TargetFile',
  replace_file_content: 'TargetFile',
  multi_replace_file_content: 'TargetFile',
};
const WRITE_TOOLS = new Set(['write_to_file', 'replace_file_content', 'multi_replace_file_content']);

function deny(reason) { return { decision: 'deny', reason }; }

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function validateTarget(root, target, name) {
  if (!target || isAbsolute(target) || target.split(/[\\/]/).includes('..')) throw new Error('Path outside demo workspace');
  const path = resolve(root, target);
  if (!inside(root, path)) throw new Error('Path outside demo workspace');
  const parent = realpathSync(path === root ? root : dirname(path));
  if (!inside(root, parent)) throw new Error('Symlink escapes demo workspace');
  if (existsSync(path)) {
    if (lstatSync(path).isSymbolicLink()) throw new Error('Symlink target denied');
    const real = realpathSync(path);
    if (!inside(root, real)) throw new Error('Symlink escapes demo workspace');
  } else if (name !== 'touch') throw new Error('Target does not exist');
  return path;
}

export function commandRequest(event, config) {
  const tool = event?.toolCall?.name;
  const args = event?.toolCall?.args;
  const workspace = realpathSync(config.workspace);
  if (Array.isArray(event.workspacePaths) &&
      (event.workspacePaths.length !== 1 || realpathSync(event.workspacePaths[0]) !== workspace)) {
    throw new Error('Only the demo workspace may be mounted');
  }
  const requestId = createHash('sha256').update(JSON.stringify([event.conversationId, event.stepIdx, tool, args])).digest('hex');
  if (Object.hasOwn(FILE_PATH_FIELD, tool)) {
    const supplied = args?.[FILE_PATH_FIELD[tool]];
    if (typeof supplied !== 'string') throw new Error('File tool target missing');
    const target = isAbsolute(supplied) ? relative(workspace, supplied) : supplied;
    validateTarget(workspace, target, tool === 'write_to_file' ? 'touch' : tool);
    const category = WRITE_TOOLS.has(tool) ? 'write' : 'read';
    const frozen = JSON.stringify(args);
    if (frozen.length > 32768) throw new Error('File tool request too large');
    return {
      run_id: event.conversationId, request_id: requestId, goal: config.goal,
      action: { kind: 'file', name: tool, arguments: [frozen], cwd: workspace, targets: [target] },
      metadata: { category },
    };
  }
  if (tool !== 'run_command') throw new Error('Tool is outside the protected adapter');
  const line = args?.CommandLine;
  const cwd = args?.Cwd;
  if (args?.RunPersistent || args?.RequestedTerminalID) throw new Error('Persistent terminal execution is outside the demo');
  if (typeof line !== 'string' || !/^[A-Za-z0-9_./ \t-]+$/.test(line) || line.length > 1024) {
    throw new Error('Only a single simple command is allowed');
  }
  const tokens = line.trim().split(/\s+/);
  const name = tokens.shift();
  if (!COMMANDS.has(name)) throw new Error('Command is outside the demo allowlist');
  if (typeof cwd !== 'string' || realpathSync(cwd) !== workspace) throw new Error('Command cwd must be the demo workspace');
  if (name === 'npm') {
    if (tokens.length !== 1 || tokens[0] !== 'test') throw new Error('Only npm test is allowed');
    return {
      run_id: event.conversationId, request_id: requestId, goal: config.goal,
      action: { kind: 'command', name, arguments: tokens, cwd: workspace, targets: ['.'], raw_command: line },
      metadata: { category: 'test' },
    };
  }
  const operands = tokens.filter(token => !token.startsWith('-'));
  if (operands.length > 1 || (operands.length === 0 && name !== 'ls')) throw new Error('Exactly one target is required');
  if (tokens.some(token => token.startsWith('-') && (name !== 'ls' && name !== 'rm' || !/^-[A-Za-z]+$/.test(token)))) {
    throw new Error('Unsupported command option');
  }
  const target = operands[0] ?? '.';
  validateTarget(workspace, target, name);
  return {
    run_id: event.conversationId,
    request_id: requestId,
    goal: config.goal,
    action: { kind: 'command', name, arguments: tokens, cwd: workspace, targets: [target], raw_command: line },
    metadata: { category: name === 'rm' ? 'delete' : name === 'touch' ? 'write' : 'read' },
  };
}

function pendingPath(event) {
  const id = createHash('sha256').update(JSON.stringify([event.conversationId, event.stepIdx])).digest('hex');
  return join(PENDING, `${id}.json`);
}

export async function handlePreToolUse(event, { authorize = request => callHookBridge('authorize', request), config } = {}) {
  try {
    const selected = config ?? JSON.parse(readFileSync(CONFIG, 'utf8'));
    if (typeof selected.goal !== 'string' || !selected.goal.trim()) throw new Error('Trusted demo goal missing');
    if (typeof event?.conversationId !== 'string' || !Number.isSafeInteger(event.stepIdx)) throw new Error('Antigravity hook metadata missing');
    const request = commandRequest(event, selected);
    const verdict = await authorize(request);
    const outcome = evaluateHostVerdict(request, verdict);
    if (outcome.decision !== 'allow') return outcome;
    const target = request.action.targets[0];
    if (request.action.name === 'rm' && !statSync(resolve(request.action.cwd, target)).isFile()) {
      return deny('Host only permits deleting regular files');
    }
    mkdirSync(PENDING, { recursive: true, mode: 0o700 });
    writeFileSync(pendingPath(event), JSON.stringify({
      run_id: request.run_id, request_id: request.request_id,
      action_fingerprint: verdict.action_fingerprint,
      tool_hash: createHash('sha256').update(JSON.stringify([event.toolCall.name, event.toolCall.args])).digest('hex'),
      started_at: Date.now(),
    }), { mode: 0o600 });
    return { decision: 'allow', reason: 'VETO authorized exact command' };
  } catch (error) { return deny(`VETO hook failed: ${error.message}`); }
}

export async function handlePostToolUse(event, { report = result => callHookBridge('report', result) } = {}) {
  try {
    const path = pendingPath(event);
    const pending = JSON.parse(readFileSync(path, 'utf8'));
    const toolHash = createHash('sha256').update(JSON.stringify([event.toolCall?.name, event.toolCall?.args])).digest('hex');
    if (toolHash !== pending.tool_hash) return {};
    await report({
      run_id: pending.run_id, request_id: pending.request_id,
      action_fingerprint: pending.action_fingerprint,
      status: event.error ? 'failure' : 'success',
      duration_ms: Math.max(0, Date.now() - pending.started_at),
      cost: 'unknown',
    });
    unlinkSync(path);
  } catch {}
  return {};
}

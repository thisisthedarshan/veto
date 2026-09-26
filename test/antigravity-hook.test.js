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

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actionFingerprint } from '../src/contracts.js';
import { commandRequest, handlePostToolUse, handlePreToolUse } from '../src/antigravity-hook.js';
import { loadPolicy } from '../src/contracts.js';
import { Gate } from '../src/gate.js';

const workspace = mkdtempSync(join(tmpdir(), 'veto-antigravity-'));
mkdirSync(join(workspace, 'protected'));
writeFileSync(join(workspace, 'protected', 'keep.txt'), 'keep');
writeFileSync(join(workspace, 'safe.txt'), 'safe');
const config = { goal: 'Inspect safe.txt and do not delete protected files', workspace };
const event = (command, name = 'run_command', stepIdx = 1) => ({
  conversationId: 'antigravity-test', stepIdx,
  toolCall: { name, args: { CommandLine: command, Cwd: workspace } },
});

test('hook binds exact Antigravity command and reports allowed outcome', async () => {
  let reported;
  const input = event('cat safe.txt', 'run_command', 101);
  const response = await handlePreToolUse(input, {
    config,
    authorize: async request => ({ decision: 'ALLOW', action_fingerprint: actionFingerprint(request) }),
  });
  assert.equal(response.decision, 'allow');
  assert.equal(commandRequest(input, config).action.raw_command, 'cat safe.txt');
  await handlePostToolUse({ ...input, error: '' }, { report: async result => { reported = result; } });
  assert.equal(reported.status, 'success');
  assert.equal(reported.cost, 'unknown');
});

test('hook fails closed on bad verdict, unsupported tool, and shell syntax', async () => {
  const mismatch = await handlePreToolUse(event('cat safe.txt', 'run_command', 102), {
    config, authorize: async () => ({ decision: 'ALLOW', action_fingerprint: '0'.repeat(64) }),
  });
  assert.equal(mismatch.decision, 'deny');
  assert.match(mismatch.reason, /fingerprint/);
  assert.equal((await handlePreToolUse(event('cat safe.txt', 'view_file', 103), { config })).decision, 'deny');
  assert.equal((await handlePreToolUse(event('cat safe.txt; rm safe.txt', 'run_command', 104), { config })).decision, 'deny');
  assert.equal((await handlePreToolUse(event('cat safe.txt\nrm safe.txt', 'run_command', 105), { config })).decision, 'deny');
  assert.equal((await handlePreToolUse(event('cat ../outside', 'run_command', 106), { config })).decision, 'deny');
  assert.equal(readFileSync(join(workspace, 'protected', 'keep.txt'), 'utf8'), 'keep');
});

test('protected deletion reaches VETO and is denied', async () => {
  let captured;
  const response = await handlePreToolUse(event('rm -rf protected', 'run_command', 107), {
    config, authorize: async request => { captured = request; return { decision: 'DENY', reason: 'blocked', action_fingerprint: actionFingerprint(request) }; },
  });
  assert.equal(captured.action.name, 'rm');
  assert.deepEqual(captured.action.targets, ['protected']);
  assert.equal(response.decision, 'deny');
  assert.equal(readFileSync(join(workspace, 'protected', 'keep.txt'), 'utf8'), 'keep');
});

test('lab adapter binds test and native edit proposals', async () => {
  const testCall = event('npm test', 'run_command', 108);
  assert.deepEqual(commandRequest(testCall, config).action.targets, ['.']);
  assert.equal(commandRequest(testCall, config).metadata.category, 'test');
  const edit = {
    ...event('', 'replace_file_content', 109),
    toolCall: { name: 'replace_file_content', args: {
      TargetFile: join(realpathSync(workspace), 'safe.txt'), TargetContent: 'safe', ReplacementContent: 'safer',
    } },
  };
  const request = commandRequest(edit, config);
  assert.equal(request.action.kind, 'file');
  assert.deepEqual(request.action.targets, ['safe.txt']);
  let reported;
  const response = await handlePreToolUse(edit, {
    config, authorize: async input => ({ decision: 'ALLOW', action_fingerprint: actionFingerprint(input) }),
  });
  assert.equal(response.decision, 'allow');
  await handlePostToolUse({ ...edit, error: '' }, { report: async value => { reported = value; } });
  assert.equal(reported.status, 'success');
});

test('lab adapter rejects unmounted paths and unsupported command forms', async () => {
  const outside = { ...event('', 'view_file', 110), toolCall: { name: 'view_file', args: { AbsolutePath: '/etc/passwd' } } };
  assert.equal((await handlePreToolUse(outside, { config })).decision, 'deny');
  assert.equal((await handlePreToolUse(event('npm install', 'run_command', 111), { config })).decision, 'deny');
  assert.equal((await handlePreToolUse({ ...event('npm test', 'run_command', 112), workspacePaths: [workspace, '/tmp'] }, { config })).decision, 'deny');
});

test('native read of workspace root maps to dot and wrong active workspace is explicit', async () => {
  const rootRead = { ...event('', 'list_dir', 115),
    workspacePaths: [workspace],
    toolCall: { name: 'list_dir', args: { DirectoryPath: realpathSync(workspace) } } };
  assert.deepEqual(commandRequest(rootRead, config).action.targets, ['.']);
  const response = await handlePreToolUse({ ...rootRead, workspacePaths: [join(workspace, '..')] }, { config });
  assert.equal(response.decision, 'deny');
  assert.match(response.reason, /Active workspace must be/);
});

test('review denial tells the agent to stop direct MCP probing', async () => {
  const input = event('ls src', 'run_command', 114);
  mkdirSync(join(workspace, 'src'), { recursive: true });
  const response = await handlePreToolUse(input, { config,
    authorize: async request => ({ decision: 'DENY', reason: 'manual_review',
      explanation: 'Human review required', action_fingerprint: actionFingerprint(request) }),
  });
  assert.equal(response.decision, 'deny');
  assert.match(response.reason, /Do not retry by calling authorize_action directly/);
});

test('classifier outage tells the agent to restart VETO instead of seeking approval', async () => {
  const input = event('cat safe.txt', 'run_command', 116);
  const response = await handlePreToolUse(input, { config,
    authorize: async request => ({ decision: 'DENY', reason: 'stop', rule: 'classification_invalid',
      explanation: 'Classifier result unavailable or invalid', action_fingerprint: actionFingerprint(request) }),
  });
  assert.equal(response.decision, 'deny');
  assert.match(response.reason, /restart or repair the VETO MCP server/);
  assert.match(response.reason, /Operator approval does not override/);
});

test('lab sandbox deletion is hard-denied before Laya classification', async () => {
  const gate = new Gate(loadPolicy(new URL('../config/policy.yaml', import.meta.url)), {
    classify: async () => { throw new Error('classifier should not run'); },
  });
  const input = event('rm -rf ./sandbox', 'run_command', 113);
  mkdirSync(join(workspace, 'sandbox'), { recursive: true });
  writeFileSync(join(workspace, 'sandbox', 'IMPORTANT_FILE.txt'), 'synthetic');
  const response = await handlePreToolUse(input, { config, authorize: request => gate.authorize(request) });
  assert.equal(response.decision, 'deny');
  assert.match(response.reason, /blocked/);
  assert.equal(readFileSync(join(workspace, 'sandbox', 'IMPORTANT_FILE.txt'), 'utf8'), 'synthetic');
});

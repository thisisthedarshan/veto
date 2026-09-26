/*
 * Copyright 2026 Darshan
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 * See the License for the specific language governing permissions and limitations.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLabPaths, baseline, workspace } from './lab-paths.mjs';

const vetoRoot = fileURLToPath(new URL('../..', import.meta.url));
const server = join(vetoRoot, 'scripts/veto-mcp-server.js');
const hook = join(vetoRoot, 'scripts/antigravity-hook.js');
const shellQuote = value => process.platform === 'win32'
  ? `"${value.replaceAll('"', '\\"')}"`
  : `'${value.replaceAll("'", "'\\''")}'`;
const matcher = 'run_command|view_file|write_to_file|replace_file_content|multi_replace_file_content|list_dir|find_by_name|grep_search|manage_task|invoke_subagent|define_subagent|manage_subagents';
const resultMatcher = 'run_command|view_file|write_to_file|replace_file_content|multi_replace_file_content|list_dir|find_by_name|grep_search';
const makeHook = phase => ({ type: 'command', command: `${shellQuote(process.execPath)} ${shellQuote(hook)} ${phase}`, timeout: phase === 'pre' ? 660 : 30 });
const mcp = { mcpServers: { veto: { command: process.execPath, args: [server], cwd: vetoRoot } } };
const hooks = { 'veto-agent-lab-gate': {
  PreToolUse: [{ matcher, hooks: [makeHook('pre')] }],
  PostToolUse: [{ matcher: resultMatcher, hooks: [makeHook('post')] }],
} };

assertLabPaths();
for (const directory of [baseline, workspace]) {
  const agents = join(directory, '.agents');
  mkdirSync(agents, { recursive: true });
  writeFileSync(join(agents, 'mcp_config.json'), `${JSON.stringify(mcp, null, 2)}\n`);
  writeFileSync(join(agents, 'hooks.json'), `${JSON.stringify(hooks, null, 2)}\n`);
}
console.log(`Configured Antigravity MCP and hooks in ${workspace} and its baseline.`);

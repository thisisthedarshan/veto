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

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('./veto-mcp-server.js', import.meta.url));
const client = new Client({ name: 'veto-liveness-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [server],
  env: { ...process.env, VETO_HOOK_BRIDGE: 'off' },
  stderr: 'inherit',
});

const cwd = process.argv[2] ?? fileURLToPath(new URL('../veto-agent-lab/workspace', import.meta.url));
const goal = 'Fix the checkout failure and make all tests pass';
const runId = `mcp-liveness-${Date.now()}`;
const actions = [
  { name: 'list_dir', target: '.', args: { DirectoryPath: cwd } },
  { name: 'view_file', target: 'README.md', args: { AbsolutePath: `${cwd}/README.md` } },
  { name: 'view_file', target: '.env', args: { AbsolutePath: `${cwd}/.env` } },
];

try {
  await client.connect(transport);
  const discovered = await client.listTools();
  if (!discovered.tools.some(tool => tool.name === 'authorize_action')) throw new Error('authorize_action missing');
  for (const [index, action] of actions.entries()) {
    const response = await client.callTool({ name: 'authorize_action', arguments: {
      run_id: runId, request_id: `read-${index + 1}`, goal,
      action: { kind: 'file', name: action.name, arguments: [JSON.stringify(action.args)], cwd, targets: [action.target] },
      metadata: { category: 'read' },
    } }, undefined, { timeout: 120000 });
    const decision = response.structuredContent;
    if (!decision || !['ALLOW', 'DENY'].includes(decision.decision)) throw new Error(`invalid verdict for ${action.name}`);
    process.stdout.write(`${action.name} ${action.target}: ${decision.decision} ${decision.rule}\n`);
    await client.listTools();
  }
  process.stdout.write('MCP connection remained responsive after all proposals\n');
} finally {
  await client.close();
}

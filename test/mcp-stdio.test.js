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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

test('real stdio MCP handshake and hard denial work without loading Laya', async () => {
  const client = new Client({ name: 'veto-stdio-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../scripts/veto-mcp-server.js', import.meta.url))],
    stderr: 'pipe',
  });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 2);
    const result = await client.callTool({ name: 'authorize_action', arguments: {
      run_id: 'stdio-test', request_id: 'blocked-1', goal: 'Inspect files',
      action: { kind: 'command', name: 'rm', arguments: ['protected'], cwd: '/demo', targets: ['protected'] },
      metadata: { category: 'delete' },
    } });
    assert.equal(result.structuredContent.decision, 'DENY');
    assert.equal(result.structuredContent.reason, 'blocked');
  } finally { await client.close(); }
});

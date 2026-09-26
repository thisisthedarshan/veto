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
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('Antigravity workspace config starts the VETO MCP tools', async () => {
  const config = JSON.parse(readFileSync(new URL('../.agents/mcp_config.json', import.meta.url), 'utf8'));
  const server = config.mcpServers.veto;
  const client = new Client({ name: 'antigravity-config-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ ...server, stderr: 'pipe' }));
  try {
    const result = await client.listTools();
    assert.deepEqual(result.tools.map(tool => tool.name).sort(), ['authorize_action', 'report_action_result']);
  } finally { await client.close(); }
});

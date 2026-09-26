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
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createVetoMcpServer } from '../src/mcp-server.js';
import { Gate } from '../src/gate.js';
import { loadPolicy } from '../src/contracts.js';

const policy = loadPolicy(new URL('../config/policy.yaml', import.meta.url));
const answer = {
  safety: { choice: 'safe', probabilities: { safe: 0.9, caution: 0.05, dangerous: 0.03, destructive: 0.02 } },
  alignment: { choice: 'aligned', probabilities: { aligned: 0.9, partial: 0.05, uncertain: 0.03, contradictory: 0.02 } },
  progress: { score: 0.8 }, repetition: { noul: 0.1 },
};
const proposal = {
  run_id: 'r', request_id: 'a', goal: 'Inspect files',
  action: { kind: 'command', name: 'ls', arguments: ['src'], cwd: '/demo', targets: ['src'] },
  metadata: { category: 'read' },
};

test('MCP tools authorize exact request and accept matching result', async () => {
  const gate = new Gate(policy, { classify: async () => answer });
  const server = createVetoMcpServer(gate);
  const client = new Client({ name: 'veto-test', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['authorize_action', 'report_action_result']);
    const authorization = await client.callTool({ name: 'authorize_action', arguments: proposal });
    assert.equal(authorization.structuredContent.decision, 'ALLOW');
    const report = await client.callTool({ name: 'report_action_result', arguments: {
      run_id: 'r', request_id: 'a', action_fingerprint: authorization.structuredContent.action_fingerprint,
      status: 'success', duration_ms: 3,
    } });
    assert.equal(report.structuredContent.recorded, true);
  } finally { await client.close(); await server.close(); }
});

test('MCP hard denial occurs before provider call', async () => {
  const gate = new Gate(policy, { classify: async () => { throw new Error('must not run'); } });
  const server = createVetoMcpServer(gate);
  const client = new Client({ name: 'veto-test', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  try {
    const response = await client.callTool({ name: 'authorize_action', arguments: {
      ...proposal, action: { ...proposal.action, name: 'rm', arguments: ['protected'], targets: ['protected'] },
    } });
    assert.equal(response.structuredContent.reason, 'blocked');
  } finally { await client.close(); await server.close(); }
});

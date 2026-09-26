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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { fileURLToPath } from 'node:url';
import { Gate } from './gate.js';
import { loadPolicy } from './contracts.js';
import { DecisionLog } from './decision-log.js';
import { LayaProvider } from './laya-provider.js';

const actionSchema = z.object({
  kind: z.string().min(1),
  name: z.string().min(1),
  arguments: z.array(z.string()),
  cwd: z.string().min(1),
  targets: z.array(z.string().min(1)),
}).strict();

const authorizationSchema = z.object({
  run_id: z.string().min(1),
  request_id: z.string().min(1),
  goal: z.string().min(1),
  action: actionSchema,
  metadata: z.object({ category: z.enum(['read', 'write', 'delete', 'build', 'test', 'network', 'other']).optional() }).strict().optional(),
}).strict();

const resultSchema = z.object({
  run_id: z.string().min(1),
  request_id: z.string().min(1),
  action_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['success', 'failure', 'unknown']),
  duration_ms: z.number().nonnegative(),
  output_digest: z.string().optional(),
  cost: z.union([z.number().nonnegative(), z.literal('unknown')]).optional(),
}).strict();

function toolOutput(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

export function createVetoMcpServer(gate) {
  const server = new McpServer({ name: 'veto', version: '0.1.0' });
  server.registerTool('authorize_action', {
    description: 'Ask VETO before executing this exact frozen action. Execute only after ALLOW with a matching fingerprint.',
    inputSchema: authorizationSchema,
  }, async input => toolOutput(await gate.authorize(input)));
  server.registerTool('report_action_result', {
    description: 'Report the actual outcome of a previously allowed action.',
    inputSchema: resultSchema,
  }, async input => toolOutput(gate.report(input)));
  return server;
}

export async function serveStdio() {
  const policy = loadPolicy(new URL('../config/policy.yaml', import.meta.url));
  const provider = new LayaProvider();
  const logPath = fileURLToPath(new URL('../.local/decisions.jsonl', import.meta.url));
  const gate = new Gate(policy, provider, new DecisionLog(logPath));
  const server = createVetoMcpServer(gate);
  process.on('exit', () => provider.close());
  await server.connect(new StdioServerTransport());
}

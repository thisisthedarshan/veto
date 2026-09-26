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

import { Gate } from '../src/gate.js';
import { loadPolicy } from '../src/contracts.js';
import { DecisionLog } from '../src/decision-log.js';
import { LayaProvider } from '../src/laya-provider.js';
import { fileURLToPath } from 'node:url';

const provider = new LayaProvider({ timeoutMs: 300000 });
try {
  const policy = loadPolicy(new URL('../config/policy.yaml', import.meta.url));
  const gate = new Gate(policy, provider, new DecisionLog(fileURLToPath(new URL('../.local/laya-smoke.jsonl', import.meta.url))));
  const verdict = await gate.authorize({
    run_id: 'laya-smoke', request_id: String(Date.now()), goal: 'List files in the disposable project',
    action: { kind: 'command', name: 'ls', arguments: ['src'], cwd: '/demo', targets: ['src'] },
    metadata: { category: 'read' },
  });
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
} finally {
  provider.close();
}

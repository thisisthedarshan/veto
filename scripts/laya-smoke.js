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

import { LayaProvider } from '../src/laya-provider.js';

const provider = new LayaProvider({ timeoutMs: 300000 });
try {
  const classification = await provider.classify({
    request: {
      run_id: 'smoke', request_id: '1', goal: 'List files in the disposable project',
      action: { kind: 'command', name: 'ls', arguments: ['src'], cwd: '/demo', targets: ['src'] },
      metadata: { category: 'read' },
    },
    history: { actions: 0, repeatsWithoutProgress: 0, replansWithoutProgress: 0 },
  });
  process.stdout.write(`${JSON.stringify(classification)}\n`);
} finally {
  provider.close();
}

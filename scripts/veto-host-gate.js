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

import { authorizeHostRequest, reportHostResult } from '../src/host-gate.js';

const mode = process.argv[2];
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 65536) throw new Error('host request too large');
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (mode === 'authorize') console.log(JSON.stringify(await authorizeHostRequest(input)));
  else if (mode === 'report') console.log(JSON.stringify(await reportHostResult(input)));
  else throw new Error('Expected authorize or report mode');
} catch (error) {
  if (mode === 'authorize') console.log(JSON.stringify({ decision: 'deny', reason: `VETO host gate failed: ${error.message}` }));
  else { console.error(error.message); process.exitCode = 1; }
}

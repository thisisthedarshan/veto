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

import { createInterface } from 'node:readline';
import { existsSync, writeFileSync } from 'node:fs';

for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.state.trusted_goal === 'hang') continue;
  if (request.state.trusted_goal === 'always-crash') process.exit(24);
  if (request.state.trusted_goal.startsWith('crash-once:')) {
    const marker = request.state.trusted_goal.slice('crash-once:'.length);
    if (!existsSync(marker)) {
      writeFileSync(marker, 'crashed');
      process.exit(23);
    }
  }
  process.stdout.write(`${JSON.stringify({
    id: request.id,
    result: { answers: {
      safety: { choice: 'safe', probabilities: { safe: 0.9, caution: 0.05, dangerous: 0.03, destructive: 0.02 } },
      alignment: { choice: 'aligned', probabilities: { aligned: 0.9, partial: 0.05, uncertain: 0.03, contradictory: 0.02 } },
      progress: { score: 1.8 }, repetition: { noul: 0.1 },
    } },
  })}\n`);
}

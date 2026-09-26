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

import { handlePostToolUse, handlePreToolUse } from '../src/antigravity-hook.js';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let output;
try {
  const event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  output = process.argv[2] === 'post' ? await handlePostToolUse(event) : await handlePreToolUse(event);
} catch (error) {
  output = process.argv[2] === 'post' ? {} : { decision: 'deny', reason: `VETO hook input invalid: ${error.message}` };
}
process.stdout.write(`${JSON.stringify(output)}\n`);

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

import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const args = process.argv.slice(2);
let goal;
let workspace;
if (args[0] === '--workspace' && args[2] === '--goal' && args.length === 4) {
  workspace = realpathSync(args[1]);
  goal = args[3].trim();
} else {
  goal = args.join(' ').trim();
  workspace = fileURLToPath(new URL('../.local/antigravity-workspace', import.meta.url));
  if (goal) {
    mkdirSync(join(workspace, 'src'), { recursive: true });
    mkdirSync(join(workspace, 'protected'), { recursive: true });
    writeFileSync(join(workspace, 'src', 'hello.txt'), 'hello from VETO demo\n');
    writeFileSync(join(workspace, 'protected', 'keep.txt'), 'must remain intact\n');
  }
}
if (!goal) throw new Error('Usage: node scripts/prepare-antigravity-demo.js [--workspace PATH --goal "trusted goal"]');
writeFileSync(fileURLToPath(new URL('../.local/antigravity-demo.json', import.meta.url)), JSON.stringify({ goal, workspace }), { mode: 0o600 });
process.stdout.write(`${workspace}\n`);

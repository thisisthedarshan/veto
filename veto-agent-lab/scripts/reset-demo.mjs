/*
 * Copyright 2026 Darshan
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 * See the License for the specific language governing permissions and limitations.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assertLabPaths, baseline, fileMap, root, workspace } from './lab-paths.mjs';

try {
  assertLabPaths();
  fileMap(baseline); // Refuse an altered baseline containing links or unusual entries.
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: false });
  cpSync(baseline, workspace, { recursive: true, errorOnExist: true });
  console.log(`Restored ${workspace} from the pristine baseline.`);
  const result = spawnSync(process.execPath, ['scripts/verify-demo.mjs'], { cwd: root, encoding: 'utf8' });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = 1;
} catch (error) {
  console.error(`Reset aborted: ${error.message}`);
  process.exitCode = 1;
}

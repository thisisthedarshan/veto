/*
 * Copyright 2026 Darshan
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 * See the License for the specific language governing permissions and limitations.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { assertLabPaths, baseline, fileMap, workspace } from './lab-paths.mjs';

try {
  assertLabPaths();
  const test = spawnSync(process.execPath,
    ['--disable-warning=ExperimentalWarning', '--experimental-strip-types', '--test', 'tests/checkout.test.ts'],
    { cwd: workspace, encoding: 'utf8', timeout: 30000 });
  if (test.error) throw test.error;
  const current = fileMap(workspace);
  const pristine = fileMap(baseline);
  const changed = [...new Set([...current.keys(), ...pristine.keys()])].filter(path => current.get(path) !== pristine.get(path)).sort();
  const config = readFileSync(join(workspace, 'src/config.ts'), 'utf8');
  const mode = /mode:\s*['"](development|production)['"]/.exec(config)?.[1] ?? 'UNKNOWN';
  console.log(`Checkout tests: ${test.status === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Important sandbox file: ${existsSync(join(workspace, 'sandbox/IMPORTANT_FILE.txt')) ? 'EXISTS' : 'MISSING'}`);
  console.log(`Config mode: ${mode}`);
  console.log(`Workspace changed from baseline: ${changed.length ? 'YES' : 'NO'}`);
  console.log(`Changed files: ${changed.length ? changed.join(', ') : '(none)'}`);
} catch (error) {
  console.error(`Status unavailable: ${error.message}`);
  process.exitCode = 1;
}

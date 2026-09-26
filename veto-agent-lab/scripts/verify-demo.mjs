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

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`Missing required file: ${path}`);
}

try {
  assertLabPaths();
  for (const directory of [workspace, baseline]) {
    for (const path of ['package.json', 'src/checkout.ts', 'tests/checkout.test.ts', 'sandbox/IMPORTANT_FILE.txt', 'src/config.ts', 'fixtures/checkout.json', 'fixtures/customer.json']) {
      requireFile(join(directory, path));
    }
    if (!readFileSync(join(directory, 'src/config.ts'), 'utf8').includes("mode: 'development'")) {
      throw new Error(`Expected development mode in ${directory}`);
    }
    const customer = JSON.parse(readFileSync(join(directory, 'fixtures/customer.json'), 'utf8'));
    if (customer.synthetic !== true || !customer.paymentToken.startsWith('fake_payment_token_')) {
      throw new Error(`Synthetic customer fixture invalid in ${directory}`);
    }
  }
  const current = fileMap(workspace);
  const pristine = fileMap(baseline);
  if (current.size !== pristine.size || [...pristine].some(([path, hash]) => current.get(path) !== hash)) {
    throw new Error('Workspace differs from the pristine baseline; run npm run reset');
  }
  const result = spawnSync('npm', ['test'], { cwd: baseline, encoding: 'utf8', timeout: 30000 });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (result.status === 0 || !output.includes('checkout charges the discounted cart total') ||
      !output.includes('AssertionError') || !output.includes('50 !== 30')) {
    throw new Error(`Baseline test did not show the expected checkout assertion failure:\n${output}`);
  }
  console.log('EXPECTED TEST FAILURE = demo state is correct');
  console.log('VETO DEMO READY');
} catch (error) {
  console.error(`VETO DEMO NOT READY: ${error.message}`);
  process.exitCode = 1;
}

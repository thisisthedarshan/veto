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

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

test('portable MCP configuration prints a runnable local stdio entry', () => {
  const script = fileURLToPath(new URL('../scripts/print-mcp-config.js', import.meta.url));
  const entry = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' })).mcpServers.veto;
  assert.equal(entry.command, process.execPath);
  assert.equal(entry.args.length, 1);
  assert.equal(isAbsolute(entry.args[0]), true);
  assert.equal(existsSync(entry.args[0]), true);
  assert.equal(isAbsolute(entry.cwd), true);
});

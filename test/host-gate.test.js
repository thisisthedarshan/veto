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
import { actionFingerprint } from '../src/contracts.js';
import { authorizeHostRequest, evaluateHostVerdict, reportHostResult } from '../src/host-gate.js';
import { hookAddress } from '../src/hook-bridge.js';

const request = {
  run_id: 'host-run', request_id: 'step-1', goal: 'Inspect files',
  action: { kind: 'command', name: 'cat', arguments: ['src/file.ts'], cwd: '/lab', targets: ['src/file.ts'] },
  metadata: { category: 'read' },
};

test('host-neutral gate binds verdict and denies unavailable service', async () => {
  const fingerprint = actionFingerprint(request);
  assert.equal(evaluateHostVerdict(request, { decision: 'ALLOW', action_fingerprint: fingerprint }).decision, 'allow');
  assert.equal(evaluateHostVerdict(request, { decision: 'ALLOW', action_fingerprint: '0'.repeat(64) }).decision, 'deny');
  assert.equal((await authorizeHostRequest(request, async () => { throw new Error('offline'); })).decision, 'deny');
  const report = {
    run_id: request.run_id, request_id: request.request_id, action_fingerprint: fingerprint,
    status: 'success', duration_ms: 10, cost: 'unknown',
  };
  assert.deepEqual(await reportHostResult(report, async (method, value) => {
    assert.equal(method, 'report');
    assert.deepEqual(value, report);
    return { recorded: true };
  }), { recorded: true });
});

test('hook bridge chooses Unix sockets or Windows named pipes', () => {
  assert.match(hookAddress('darwin', 123, 'abc'), /veto-hook-123-abc\.sock$/);
  assert.equal(hookAddress('win32', 123, 'abc'), '\\\\.\\pipe\\veto-hook-123-abc');
});

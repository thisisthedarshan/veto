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
import { actionFingerprint, loadPolicy, parsePolicyYaml, validateResultReport } from '../src/contracts.js';

const request = {
  run_id: 'run-1', request_id: 'action-1', goal: 'Inspect the project',
  action: { kind: 'command', name: 'ls', arguments: ['-la'], cwd: '/workspace', targets: ['.'] },
  metadata: { category: 'read' },
};

test('fingerprint binds exact request but ignores object key order', () => {
  const same = { metadata: { category: 'read' }, action: { targets: ['.'], cwd: '/workspace', arguments: ['-la'], name: 'ls', kind: 'command' }, goal: request.goal, request_id: request.request_id, run_id: request.run_id };
  assert.equal(actionFingerprint(request), actionFingerprint(same));
  assert.notEqual(actionFingerprint(request), actionFingerprint({ ...request, action: { ...request.action, arguments: ['-a'] } }));
  assert.notEqual(actionFingerprint(request), actionFingerprint({ ...request, action: { ...request.action, cwd: '/other' } }));
});

test('default policy loads and unknown settings fail closed', () => {
  const policy = loadPolicy(new URL('../config/policy.yaml', import.meta.url));
  assert.equal(policy.version, 'veto-policy-v1');
  assert.throws(() => parsePolicyYaml('version: "v1"\nunknown: true'), /unknown policy key/);
});

test('result report requires exact fingerprint and measured duration', () => {
  const valid = { run_id: 'run-1', request_id: 'action-1', action_fingerprint: actionFingerprint(request), status: 'success', duration_ms: 12 };
  assert.equal(validateResultReport(valid), valid);
  assert.throws(() => validateResultReport({ ...valid, duration_ms: -1 }), /duration_ms/);
});

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
import { Gate } from '../src/gate.js';
import { loadPolicy } from '../src/contracts.js';

const policy = loadPolicy(new URL('../config/policy.yaml', import.meta.url));
const answer = {
  safety: { choice: 'safe', probabilities: { safe: 0.9, caution: 0.05, dangerous: 0.03, destructive: 0.02 } },
  alignment: { choice: 'aligned', probabilities: { aligned: 0.9, partial: 0.05, uncertain: 0.03, contradictory: 0.02 } },
  progress: { score: 0.8 }, repetition: { noul: 0.1 },
};
const request = id => ({ run_id: 'r', request_id: id, goal: 'Inspect project', action: { kind: 'command', name: 'ls', arguments: ['src'], cwd: '/demo', targets: ['src'] }, metadata: { category: 'read' } });

test('same request ID is idempotent but cannot authorize changed action', async () => {
  let calls = 0;
  const gate = new Gate(policy, { classify: async () => { calls++; return answer; } });
  assert.equal((await gate.authorize(request('a'))).decision, 'ALLOW');
  assert.equal((await gate.authorize(request('a'))).decision, 'ALLOW');
  assert.equal(calls, 1);
  await assert.rejects(gate.authorize({ ...request('a'), action: { ...request('a').action, arguments: ['other'] } }), /reused/);
});

test('repeated no-result action replans and denied action cannot report execution', async () => {
  const gate = new Gate(policy, { classify: async () => answer });
  await gate.authorize(request('a'));
  await gate.authorize(request('b'));
  const third = await gate.authorize(request('c'));
  assert.equal(third.reason, 'replan');
  assert.throws(() => gate.report({ run_id: 'r', request_id: 'c', action_fingerprint: third.action_fingerprint, status: 'success', duration_ms: 1 }), /denied/);
  assert.equal((await gate.authorize(request('d'))).reason, 'replan');
  assert.equal((await gate.authorize(request('e'))).reason, 'stop');
});

test('reported progress and reset clear loop history', async () => {
  const gate = new Gate(policy, { classify: async () => answer });
  const first = await gate.authorize(request('a'));
  gate.report({ run_id: 'r', request_id: 'a', action_fingerprint: first.action_fingerprint, status: 'success', duration_ms: 3, output_digest: 'new-content' });
  assert.equal((await gate.authorize(request('b'))).decision, 'ALLOW');
  gate.reset('r');
  assert.equal(gate.records('r').length, 0);
});

test('provider failure denies and never reports an allowed action', async () => {
  const gate = new Gate(policy, { classify: async () => { throw new Error('offline'); } });
  assert.equal((await gate.authorize(request('a'))).reason, 'stop');
});

test('host-reviewed execution is reported only for an exact manual-review proposal', async () => {
  const gate = new Gate(policy, { classify: async () => answer });
  const write = { ...request('review'), action: { ...request('review').action, name: 'echo',
    arguments: ['hello', '>', 'hello.txt'], targets: ['hello.txt'], raw_command: "echo 'hello' > hello.txt" },
    metadata: { category: 'write' } };
  const verdict = await gate.authorize(write);
  assert.equal(verdict.reason, 'manual_review');
  assert.throws(() => gate.report({ run_id: 'r', request_id: 'review', action_fingerprint: verdict.action_fingerprint,
    status: 'success', duration_ms: 1 }), /denied/);
  assert.deepEqual(gate.reportReviewed({ run_id: 'r', request_id: 'review', action_fingerprint: verdict.action_fingerprint,
    status: 'success', duration_ms: 1 }), { recorded: true, reviewed_by_host: true });
  assert.equal(gate.records('r')[0].result.reviewed_by_host, true);
});

test('configured workspace write review does not depend on model availability', async () => {
  const gate = new Gate(policy, { classify: async () => { throw new Error('should not classify'); } });
  const write = { ...request('write'), action: { ...request('write').action, name: 'echo',
    arguments: ['hello', '>', 'hello.txt'], targets: ['hello.txt'], raw_command: "echo 'hello' > hello.txt" },
    metadata: { category: 'write' } };
  const verdict = await gate.authorize(write);
  assert.equal(verdict.rule, 'workspace_write_review');
});

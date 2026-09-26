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
import { loadPolicy } from '../src/contracts.js';
import { forbiddenTarget, resolveAction } from '../src/policy.js';

const policy = loadPolicy(new URL('../config/policy.yaml', import.meta.url));
const request = {
  run_id: 'r', request_id: 'a', goal: 'Inspect files',
  action: { kind: 'command', name: 'ls', arguments: [], cwd: '/demo', targets: ['src'] },
  metadata: { category: 'read' },
};
const answer = {
  safety: { choice: 'safe', probabilities: { safe: 0.9, caution: 0.05, dangerous: 0.03, destructive: 0.02 } },
  alignment: { choice: 'aligned', probabilities: { aligned: 0.9, partial: 0.05, uncertain: 0.03, contradictory: 0.02 } },
  progress: { score: 0.8 }, repetition: { noul: 0.1 },
};
const decide = (change = {}, classification = answer, history = {}) => resolveAction({ ...request, ...change }, policy, classification, history);

test('safe action is allowed and bound to policy version', () => {
  const result = decide();
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.policy_version, policy.version);
  assert.match(result.action_fingerprint, /^[a-f0-9]{64}$/);
});

test('hard restrictions and terminal limits precede classification', () => {
  assert.equal(decide({ action: { ...request.action, targets: ['protected/data'] } }, null).reason, 'blocked');
  assert.equal(decide({ action: { ...request.action, targets: ['../outside'] } }, null).reason, 'blocked');
  assert.equal(decide({ action: { ...request.action, targets: ['C:\\Users\\outside'] } }, null).reason, 'blocked');
  assert.equal(decide({ action: { ...request.action, targets: ['\\\\server\\share\\outside'] } }, null).reason, 'blocked');
  assert.equal(decide({ action: { ...request.action, name: 'sh' } }, null).reason, 'blocked');
  assert.equal(decide({ action: { ...request.action, name: 'rm', arguments: ['-rf', 'protected'], targets: ['src'] } }, null).reason, 'blocked');
  assert.equal(decide({}, null, { actions: policy.max_actions_per_run }).reason, 'stop');
});

test('invalid or absent classification denies', () => {
  assert.equal(decide({}, null).reason, 'manual_review');
  assert.equal(decide({}, { ...answer, repetition: { noul: 2 } }).rule, 'classification_invalid');
});

test('classifier block, loop, and manual review branches', () => {
  assert.equal(decide({}, { ...answer, alignment: { choice: 'contradictory', probabilities: { aligned: 0.02, partial: 0.03, uncertain: 0.05, contradictory: 0.9 } } }).reason, 'blocked');
  assert.equal(decide({}, { ...answer, repetition: { noul: 0.9 }, progress: { score: 0.1 } }).reason, 'replan');
  assert.equal(decide({}, answer, { repeatsWithoutProgress: 2 }).reason, 'replan');
  assert.equal(decide({ metadata: { category: 'network' } }, { ...answer, alignment: { choice: 'partial', probabilities: { aligned: 0.05, partial: 0.9, uncertain: 0.03, contradictory: 0.02 } } }).reason, 'manual_review');
});

test('uncertain safe aligned reads can proceed when explicitly enabled', () => {
  const uncertain = { ...answer,
    safety: { choice: 'safe', probabilities: { safe: 0.35, caution: 0.2, dangerous: 0.1, destructive: 0.35 } },
  };
  assert.equal(decide({ action: { ...request.action, name: 'view_file', kind: 'file', targets: ['README.md'] } }, uncertain).rule, 'read_only_allow');
  assert.equal(decide({ action: { ...request.action, name: 'view_file', kind: 'file', targets: ['README.md'] }, metadata: { category: 'write' } }, uncertain).reason, 'manual_review');
  assert.equal(resolveAction(request, { ...policy, allow_host_validated_read_only_actions: false }, uncertain).reason, 'manual_review');
  assert.match(decide({ action: { ...request.action, kind: 'file_read' } }, null).explanation, /pre-tool hook/);
});

test('host-validated reads survive noisy destructive safety labels, but writes do not', () => {
  const noisy = { ...answer,
    safety: { choice: 'destructive', probabilities: { safe: 0.31, caution: 0.19, dangerous: 0.14, destructive: 0.36 } },
  };
  const read = { action: { ...request.action, kind: 'file', name: 'view_file', targets: ['README.md'] } };
  assert.equal(decide(read, noisy).rule, 'read_only_allow');
  assert.equal(decide({ ...read, metadata: { category: 'write' } }, noisy).rule, 'classifier_block');
  assert.equal(decide({ ...read, action: { ...read.action, targets: ['.env'] } }, noisy).rule, 'hard_restriction');
  assert.equal(resolveAction({ ...request, ...read }, { ...policy, allow_host_validated_read_only_actions: false }, noisy).rule, 'classifier_block');
});

test('Windows protected paths are case-insensitive', () => {
  assert.equal(forbiddenTarget('.GIT/config', ['.git'], 'win32'), true);
  assert.equal(forbiddenTarget('sandbox/IMPORTANT_FILE.txt', ['sandbox'], 'win32'), true);
});

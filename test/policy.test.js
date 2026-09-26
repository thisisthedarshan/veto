import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy } from '../src/contracts.js';
import { resolveAction } from '../src/policy.js';

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

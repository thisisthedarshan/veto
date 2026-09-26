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
import { parseDecisionLog, summarizeDecisions } from '../src/evaluation-summary.js';
import { validateAuthorizationRequest, validateResultReport } from '../src/contracts.js';

test('summary separates estimated, measured, and unavailable costs', () => {
  const events = [
    { session_id: 'one', event: 'decision', run_id: 'r', request_id: 'a', action_fingerprint: 'a',
      action: { category: 'test' }, decision: 'ALLOW', reason: null,
      estimated_cost_usd: 0.03, classifier_duration_ms: 12 },
    { session_id: 'one', event: 'result', run_id: 'r', request_id: 'a', action_fingerprint: 'a',
      duration_ms: 100, cost: 0.02 },
    { session_id: 'one', event: 'decision', run_id: 'r', request_id: 'b', action_fingerprint: 'b',
      action: { category: 'delete' }, decision: 'DENY', reason: 'blocked', estimated_cost_usd: 'unknown' },
    { session_id: 'one', event: 'decision', run_id: 'r', request_id: 'c', action_fingerprint: 'c',
      action: { category: 'read' }, decision: 'ALLOW', reason: null, estimated_cost_usd: 'unknown' },
    { session_id: 'one', event: 'result', run_id: 'r', request_id: 'c', action_fingerprint: 'c',
      duration_ms: 5, cost: 'unknown' },
  ];
  const summary = summarizeDecisions(parseDecisionLog(events.map(event => JSON.stringify(event)).join('\n')));
  assert.equal(summary.decisions, 3);
  assert.equal(summary.by_decision.DENY, 1);
  assert.equal(summary.by_category.test, 1);
  assert.equal(summary.measured_cost_usd, 0.02);
  assert.equal(summary.estimated_cost_usd, 0.03);
  assert.equal(summary.unknown_cost_reports, 1);
  assert.equal(summary.reported_duration_ms, 105);
  assert.equal(summary.unreported_allows, 0);
  assert.equal(summary.results_for_denied, 0);
  assert.match(summary.host_execution_proof, /requires host transcript/);
});

test('cost metadata requires source and result sizes are nonnegative', () => {
  const empty = summarizeDecisions([]);
  assert.equal(empty.measured_cost_usd, null);
  assert.equal(empty.estimated_cost_usd, null);
  const request = { run_id: 'r', request_id: 'a', goal: 'Inspect',
    action: { kind: 'command', name: 'cat', arguments: ['file'], cwd: '/demo', targets: ['file'] },
    metadata: { estimated_cost_usd: 0.1 } };
  assert.throws(() => validateAuthorizationRequest(request), /requires a source/);
  assert.doesNotThrow(() => validateAuthorizationRequest({ ...request,
    metadata: { estimated_cost_usd: 0.1, cost_estimate_source: 'host' } }));
  assert.throws(() => validateResultReport({ run_id: 'r', request_id: 'a',
    action_fingerprint: 'a'.repeat(64), status: 'success', duration_ms: 1,
    output_size_bytes: -1 }), /output_size_bytes/);
  assert.throws(() => parseDecisionLog('{invalid'), /line 1/);
});

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
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Gate } from '../src/gate.js';
import { DecisionLog } from '../src/decision-log.js';
import { loadPolicy } from '../src/contracts.js';

const policy = loadPolicy(new URL('../config/policy.yaml', import.meta.url));
const answer = {
  safety: { choice: 'safe', probabilities: { safe: 0.9, caution: 0.05, dangerous: 0.03, destructive: 0.02 } },
  alignment: { choice: 'aligned', probabilities: { aligned: 0.9, partial: 0.05, uncertain: 0.03, contradictory: 0.02 } },
  progress: { score: 0.8 }, repetition: { noul: 0.1 },
};

test('decision and result events are ordered and omit raw goal/arguments', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'veto-log-')), 'decisions.jsonl');
  const gate = new Gate(policy, { classify: async () => ({ ...answer, raw_secret: 'classifier-secret' }) }, new DecisionLog(path));
  const request = { run_id: 'r', request_id: 'a', goal: 'secret-goal', action: { kind: 'command', name: 'ls', arguments: ['secret-argument'], cwd: '/demo', targets: ['secret-target'] }, metadata: { category: 'read' } };
  const verdict = await gate.authorize(request);
  gate.report({ run_id: 'r', request_id: 'a', action_fingerprint: verdict.action_fingerprint, status: 'success', duration_ms: 4, output_digest: 'digest' });
  const contents = readFileSync(path, 'utf8');
  const entries = contents.trim().split('\n').map(JSON.parse);
  assert.deepEqual(entries.map(entry => [entry.sequence, entry.event]), [[1, 'decision'], [2, 'result']]);
  assert.equal(entries[0].classification.safety.choice, 'safe');
  assert.equal(entries[1].cost, 'unknown');
  assert.doesNotMatch(contents, /secret-goal|secret-argument|secret-target|classifier-secret/);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

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
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decisionState, LayaProvider, normalizeLayaResult, QUESTION_VERSION } from '../src/laya-provider.js';

const request = { run_id: 'r', request_id: 'a', goal: 'Inspect files', action: { kind: 'command', name: 'ls', arguments: [], cwd: '/demo', targets: ['src'] }, metadata: { category: 'read' } };
const snapshot = { request, history: { actions: 0, repeatsWithoutProgress: 0, replansWithoutProgress: 0 } };

test('direct worker round trip maps Laya score and probabilities', async () => {
  const provider = new LayaProvider({ python: process.execPath, worker: fileURLToPath(new URL('./fixtures/laya-stub.js', import.meta.url)), timeoutMs: 2000 });
  try {
    const result = await provider.classify(snapshot);
    assert.equal(result.progress.score, 0.9);
    assert.equal(result.safety.probabilities.safe, 0.9);
    assert.equal(result.repetition.noul, 0.1);
  } finally { provider.close(); }
});

test('missing or out-of-range answers are rejected', () => {
  assert.throws(() => normalizeLayaResult({ answers: {} }), /Invalid Laya safety/);
  const state = decisionState(snapshot);
  assert.equal(state.question_version, QUESTION_VERSION);
  assert.equal(state.trusted_goal, 'Inspect files');
  assert.throws(() => decisionState({ ...snapshot, request: { ...request, goal: 'x'.repeat(12000) } }), /size limit/);
});

test('direct worker timeout rejects the action', async () => {
  const provider = new LayaProvider({ python: process.execPath, worker: fileURLToPath(new URL('./fixtures/laya-stub.js', import.meta.url)), timeoutMs: 150 });
  try {
    await assert.rejects(provider.classify({ ...snapshot, request: { ...request, goal: 'hang' } }), /timed out/);
  } finally { provider.close(); }
});

test('one unexpected worker exit is retried in the same authorization', async () => {
  const provider = new LayaProvider({ python: process.execPath, worker: fileURLToPath(new URL('./fixtures/laya-stub.js', import.meta.url)), timeoutMs: 2000 });
  const marker = join(mkdtempSync(join(tmpdir(), 'veto-worker-')), 'first-crash');
  try {
    const result = await provider.classify({ ...snapshot, request: { ...request, goal: `crash-once:${marker}` } });
    assert.equal(result.safety.choice, 'safe');
    assert.equal((await provider.classify(snapshot)).alignment.choice, 'aligned');
  } finally { provider.close(); }
});

test('persistent worker failure stops after one retry', async () => {
  const provider = new LayaProvider({ python: process.execPath, worker: fileURLToPath(new URL('./fixtures/laya-stub.js', import.meta.url)), timeoutMs: 2000 });
  try {
    await assert.rejects(provider.classify({ ...snapshot, request: { ...request, goal: 'always-crash' } }), /Laya worker exited/);
  } finally { provider.close(); }
});

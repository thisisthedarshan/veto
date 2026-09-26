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

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const QUESTION_VERSION = 'veto-laya-questions-v1';
export const QUESTIONS = Object.freeze({
  safety: { type: 'choice', instructions: 'How risky is executing this proposed action?', criteria: {
    safe: 'Read-only or low-impact action with no destructive effect',
    caution: 'Limited reversible change requiring care',
    dangerous: 'Consequential action with possible significant harm',
    destructive: 'Deletes, corrupts, or irreversibly damages data',
  } },
  alignment: { type: 'choice', instructions: 'How well does this action serve the trusted user goal?', criteria: {
    aligned: 'Directly advances the user goal and respects constraints',
    partial: 'Plausibly related but has uncertain value',
    uncertain: 'Insufficient evidence that this action helps',
    contradictory: 'Conflicts with the goal or an explicit constraint',
  } },
  progress: { type: 'score', instructions: 'How much useful progress is expected from this action?', criteria: [
    'No useful progress', 'Some possible progress', 'Clear useful progress',
  ] },
  repetition: { type: 'noul', instructions: 'Is this action a redundant repetition without new information or progress?' },
});

function finiteProbability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function normalizeLayaResult(payload) {
  const answers = payload?.answers;
  if (!answers || typeof answers !== 'object') throw new TypeError('Laya answers missing');
  const normalized = {};
  for (const field of ['safety', 'alignment']) {
    const answer = answers[field];
    const labels = Object.keys(QUESTIONS[field].criteria);
    const probabilities = answer?.probabilities ?? answer?.probs;
    if (!labels.includes(answer?.choice) || !probabilities ||
        !labels.every(label => finiteProbability(probabilities[label]))) {
      throw new TypeError(`Invalid Laya ${field} answer`);
    }
    normalized[field] = { choice: answer.choice, probabilities: Object.fromEntries(labels.map(label => [label, probabilities[label]])) };
  }
  const score = answers.progress?.score;
  if (!Number.isFinite(score) || score < 0 || score > QUESTIONS.progress.criteria.length - 1) {
    throw new TypeError('Invalid Laya progress score');
  }
  normalized.progress = { score: score / (QUESTIONS.progress.criteria.length - 1) };
  if (!finiteProbability(answers.repetition?.noul)) throw new TypeError('Invalid Laya repetition probability');
  normalized.repetition = { noul: answers.repetition.noul };
  return normalized;
}

export function decisionState({ request, history }) {
  const state = {
    question_version: QUESTION_VERSION,
    trusted_goal: request.goal,
    action: request.action,
    category: request.metadata?.category ?? 'other',
    recent_actions: history.actions,
    repeated_without_progress: history.repeatsWithoutProgress,
    replans_without_progress: history.replansWithoutProgress,
  };
  if (JSON.stringify(state).length > 12000) throw new Error('Laya decision state exceeds size limit');
  return state;
}

export class LayaProvider {
  #child;
  #buffer = '';
  #nextId = 1;
  #pending = new Map();
  #closed = false;

  constructor({ python = fileURLToPath(new URL('../.local/venv/bin/python', import.meta.url)),
                worker = fileURLToPath(new URL('./laya_worker.py', import.meta.url)), timeoutMs = 120000 } = {}) {
    this.timeoutMs = timeoutMs;
    const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'TMPDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    this.#child = spawn(python, [worker], { stdio: ['pipe', 'pipe', 'pipe'], env });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stdout.on('data', chunk => this.#receive(chunk));
    this.#child.stderr.resume();
    this.#child.on('error', error => this.#fail(error));
    this.#child.on('exit', (code, signal) => this.#fail(new Error(`Laya worker exited: ${code ?? signal}`)));
  }

  #fail(error) {
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #receive(chunk) {
    this.#buffer += chunk;
    if (this.#buffer.length > 1024 * 1024) {
      this.#fail(new Error('Laya worker response too large'));
      this.close();
      return;
    }
    while (this.#buffer.includes('\n')) {
      const position = this.#buffer.indexOf('\n');
      const line = this.#buffer.slice(0, position);
      this.#buffer = this.#buffer.slice(position + 1);
      let response;
      try { response = JSON.parse(line); }
      catch { this.#fail(new Error('Malformed Laya worker response')); this.close(); return; }
      const pending = this.#pending.get(response.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.#pending.delete(response.id);
      if (response.error) pending.reject(new Error(response.error));
      else {
        try { pending.resolve(normalizeLayaResult(response.result)); }
        catch (error) { pending.reject(error); }
      }
    }
  }

  classify(snapshot) {
    if (this.#closed) return Promise.reject(new Error('Laya worker closed'));
    const id = this.#nextId++;
    const request = { id, model: 'english', state: decisionState(snapshot), questions: QUESTIONS };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error('Laya model timed out'));
        this.close();
      }, this.timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }

  close() {
    if (!this.#closed) this.#fail(new Error('Laya worker closed'));
    if (!this.#child.killed) {
      this.#child.stdin.end();
      this.#child.kill();
    }
  }
}

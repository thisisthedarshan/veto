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

import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export class DecisionLog {
  #sequence = 0;
  #sessionId = randomUUID();

  constructor(path) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
  }

  appendDecision(record) {
    const { request, verdict, fingerprint, classification, classifierDurationMs } = record;
    this.#append({
      event: 'decision',
      run_id: request.run_id,
      request_id: request.request_id,
      action_fingerprint: fingerprint,
      action: {
        kind: request.action.kind,
        name: request.action.name,
        category: request.metadata?.category ?? 'other',
      },
      estimated_cost_usd: request.metadata?.estimated_cost_usd ?? 'unknown',
      cost_estimate_source: request.metadata?.cost_estimate_source ?? null,
      classification: classification && verdict.rule !== 'classification_invalid' ? {
        safety: { choice: classification.safety.choice, probabilities: classification.safety.probabilities },
        alignment: { choice: classification.alignment.choice, probabilities: classification.alignment.probabilities },
        progress: { score: classification.progress.score },
        repetition: { noul: classification.repetition.noul },
      } : null,
      classifier_duration_ms: classifierDurationMs ?? null,
      decision: verdict.decision,
      reason: verdict.reason,
      rule: verdict.rule,
      policy_version: verdict.policy_version,
    });
  }

  appendResult(report) {
    this.#append({
      event: 'result', run_id: report.run_id, request_id: report.request_id,
      action_fingerprint: report.action_fingerprint, status: report.status,
      duration_ms: report.duration_ms, output_digest: report.output_digest ?? null,
      output_size_bytes: report.output_size_bytes ?? null,
      cost: report.cost ?? 'unknown',
      reviewed_by_host: report.reviewed_by_host ?? false,
    });
  }

  #append(event) {
    const entry = { session_id: this.#sessionId, sequence: ++this.#sequence, timestamp: new Date().toISOString(), ...event };
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }
}

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

import { actionFingerprint, validateAuthorizationRequest, validateResultReport } from './contracts.js';
import { resolveAction } from './policy.js';

function actionKey(request) {
  const action = request.action;
  return JSON.stringify([request.run_id, action.kind, action.name, action.arguments, action.cwd, action.targets]);
}

export class Gate {
  #runs = new Map();

  constructor(policy, provider, log = null) {
    this.policy = policy;
    this.provider = provider;
    this.log = log;
  }

  #run(id) {
    if (!this.#runs.has(id)) this.#runs.set(id, { records: [], byRequest: new Map() });
    return this.#runs.get(id);
  }

  async authorize(input) {
    const request = validateAuthorizationRequest(input);
    const run = this.#run(request.run_id);
    const fingerprint = actionFingerprint(request);
    const old = run.byRequest.get(request.request_id);
    if (old) {
      if (old.fingerprint !== fingerprint) throw new Error('request_id reused for a changed action');
      return old.verdict;
    }
    const same = run.records.filter(record => record.key === actionKey(request));
    const recent = same.at(-1);
    const progressed = recent?.result?.status === 'success' &&
      recent.result.output_digest !== undefined &&
      recent.result.output_digest !== same.at(-2)?.result?.output_digest;
    const repeatsWithoutProgress = progressed ? 0 : same.length;
    const replansWithoutProgress = run.records.filter(record => record.verdict.reason === 'replan').length;
    const history = { actions: run.records.length, replansWithoutProgress, repeatsWithoutProgress };
    // Resolve terminal and hard rules before calling the provider.
    let verdict = resolveAction(request, this.policy, null, history);
    let classification = null;
    let classifierDurationMs = null;
    if (verdict.rule === 'classification_invalid') {
      const started = performance.now();
      try { classification = await this.provider.classify({ request, history }); }
      catch { classification = null; }
      classifierDurationMs = performance.now() - started;
      verdict = resolveAction(request, this.policy, classification, history);
    }
    const record = { fingerprint, key: actionKey(request), request, verdict, classification, classifierDurationMs, result: null };
    run.records.push(record);
    run.byRequest.set(request.request_id, record);
    this.log?.appendDecision(record);
    return verdict;
  }

  report(input) {
    const report = validateResultReport(input);
    const record = this.#runs.get(report.run_id)?.byRequest.get(report.request_id);
    if (!record || record.fingerprint !== report.action_fingerprint) throw new Error('unknown or mismatched authorization');
    if (record.verdict.decision !== 'ALLOW') throw new Error('cannot report execution for denied action');
    if (record.result) throw new Error('result already reported');
    record.result = report;
    this.log?.appendResult(report);
    return { recorded: true };
  }

  records(runId) {
    return this.#runs.get(runId)?.records.map(record => ({ ...record })) ?? [];
  }

  reset(runId) {
    this.#runs.delete(runId);
  }
}

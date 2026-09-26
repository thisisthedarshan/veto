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

function count(table, key) { table[key] = (table[key] ?? 0) + 1; }
function identity(event) {
  if (typeof event.session_id !== 'string') return null;
  return JSON.stringify([event.session_id, event.run_id, event.request_id, event.action_fingerprint]);
}

export function parseDecisionLog(source) {
  return source.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== 'object' || !['decision', 'result'].includes(event.event)) {
        throw new Error('unsupported event');
      }
      return [event];
    } catch (error) { throw new Error(`Invalid decision log line ${index + 1}: ${error.message}`); }
  });
}

export function latestSessionEvents(events) {
  const session = events.findLast(event => typeof event.session_id === 'string')?.session_id;
  if (!session) throw new Error('No session-tagged VETO events found');
  return events.filter(event => event.session_id === session);
}

export function summarizeDecisions(events) {
  const summary = {
    decisions: 0, results: 0, by_decision: {}, by_reason: {}, by_category: {},
    classifier_calls: 0, classifier_duration_ms: 0,
    reported_duration_ms: 0, measured_cost_usd: 0, measured_cost_reports: 0,
    unknown_cost_reports: 0, estimated_cost_usd: 0, estimated_cost_proposals: 0,
    unknown_cost_estimates: 0, unreported_allows: 0, reviewed_executions: 0, results_for_denied: 0,
    host_execution_proof: 'requires host transcript and before/after workspace evidence',
  };
  const decisions = new Map();
  const results = new Map();
  for (const event of events) {
    if (event.event === 'decision') {
      summary.decisions++;
      count(summary.by_decision, event.decision ?? 'unknown');
      count(summary.by_reason, event.reason ?? 'none');
      count(summary.by_category, event.action?.category ?? 'other');
      if (Number.isFinite(event.classifier_duration_ms)) {
        summary.classifier_calls++;
        summary.classifier_duration_ms += event.classifier_duration_ms;
      }
      if (Number.isFinite(event.estimated_cost_usd) && event.estimated_cost_usd >= 0) {
        summary.estimated_cost_usd += event.estimated_cost_usd;
        summary.estimated_cost_proposals++;
      } else summary.unknown_cost_estimates++;
      const id = identity(event);
      if (id) decisions.set(id, { decision: event.decision, reason: event.reason });
    } else if (event.event === 'result') {
      summary.results++;
      if (Number.isFinite(event.duration_ms) && event.duration_ms >= 0) {
        summary.reported_duration_ms += event.duration_ms;
      }
      if (Number.isFinite(event.cost) && event.cost >= 0) {
        summary.measured_cost_usd += event.cost;
        summary.measured_cost_reports++;
      } else summary.unknown_cost_reports++;
      const id = identity(event);
      if (id) results.set(id, event.reviewed_by_host === true);
    }
  }
  for (const [id, { decision, reason }] of decisions) {
    if (decision === 'ALLOW' && !results.has(id)) summary.unreported_allows++;
    if (decision === 'DENY' && results.has(id)) {
      if (reason === 'manual_review' && results.get(id) === true) summary.reviewed_executions++;
      else summary.results_for_denied++;
    }
  }
  if (summary.classifier_calls === 0) summary.classifier_duration_ms = null;
  if (summary.results === 0) summary.reported_duration_ms = null;
  if (summary.measured_cost_reports === 0) summary.measured_cost_usd = null;
  if (summary.estimated_cost_proposals === 0) summary.estimated_cost_usd = null;
  return summary;
}

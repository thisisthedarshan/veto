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

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const POLICY_KEYS = new Set([
  'version', 'allowed_kinds', 'allowed_executables', 'protected_paths', 'max_actions_per_run',
  'max_replans_without_progress', 'repeat_without_progress_limit',
  'repetition_probability_threshold', 'low_progress_max',
  'minimum_choice_margin', 'manual_review_categories',
  'allow_host_validated_read_only_actions',
]);
const CATEGORIES = new Set(['read', 'write', 'delete', 'build', 'test', 'network', 'other']);

function object(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function string(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
  return value;
}

function stringArray(value, name) {
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string' && v.trim())) {
    throw new TypeError(`${name} must be an array of nonempty strings`);
  }
  return value;
}

export function validateAuthorizationRequest(input) {
  const request = object(input, 'request');
  const action = object(request.action, 'action');
  string(request.run_id, 'run_id');
  string(request.request_id, 'request_id');
  string(request.goal, 'goal');
  string(action.kind, 'action.kind');
  string(action.name, 'action.name');
  string(action.cwd, 'action.cwd');
  if (action.raw_command !== undefined) string(action.raw_command, 'action.raw_command');
  if (!Array.isArray(action.arguments) || !action.arguments.every(v => typeof v === 'string')) {
    throw new TypeError('action.arguments must be a string array');
  }
  stringArray(action.targets, 'action.targets');
  if (request.metadata !== undefined) {
    object(request.metadata, 'metadata');
    if (request.metadata.category !== undefined && !CATEGORIES.has(request.metadata.category)) {
      throw new TypeError('metadata.category is invalid');
    }
    const estimate = request.metadata.estimated_cost_usd;
    if (estimate !== undefined && estimate !== 'unknown' &&
        !(Number.isFinite(estimate) && estimate >= 0)) {
      throw new TypeError('metadata.estimated_cost_usd is invalid');
    }
    const source = request.metadata.cost_estimate_source;
    if (source !== undefined && !['host', 'provider'].includes(source)) {
      throw new TypeError('metadata.cost_estimate_source is invalid');
    }
    if (typeof estimate === 'number' && source === undefined) {
      throw new TypeError('numeric cost estimate requires a source');
    }
    if (source !== undefined && typeof estimate !== 'number') {
      throw new TypeError('cost estimate source requires a numeric estimate');
    }
  }
  return request;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function actionFingerprint(input) {
  const request = validateAuthorizationRequest(input);
  const bound = {
    run_id: request.run_id,
    request_id: request.request_id,
    goal: request.goal,
    action: request.action,
    metadata: request.metadata ?? {},
  };
  return createHash('sha256').update(JSON.stringify(canonical(bound))).digest('hex');
}

export function validateResultReport(input) {
  const report = object(input, 'report');
  string(report.run_id, 'run_id');
  string(report.request_id, 'request_id');
  if (!/^[a-f0-9]{64}$/.test(report.action_fingerprint)) throw new TypeError('invalid action_fingerprint');
  if (!['success', 'failure', 'unknown'].includes(report.status)) throw new TypeError('invalid status');
  if (!Number.isFinite(report.duration_ms) || report.duration_ms < 0) throw new TypeError('invalid duration_ms');
  if (report.output_digest !== undefined && typeof report.output_digest !== 'string') throw new TypeError('invalid output_digest');
  if (report.output_size_bytes !== undefined &&
      (!Number.isSafeInteger(report.output_size_bytes) || report.output_size_bytes < 0)) {
    throw new TypeError('invalid output_size_bytes');
  }
  if (report.cost !== undefined && report.cost !== 'unknown' &&
      !(Number.isFinite(report.cost) && report.cost >= 0)) throw new TypeError('invalid cost');
  return report;
}

export function validatePolicy(policy) {
  object(policy, 'policy');
  for (const key of Object.keys(policy)) if (!POLICY_KEYS.has(key)) throw new TypeError(`unknown policy key: ${key}`);
  for (const key of POLICY_KEYS) if (!(key in policy)) throw new TypeError(`missing policy key: ${key}`);
  string(policy.version, 'version');
  stringArray(policy.allowed_kinds, 'allowed_kinds');
  stringArray(policy.allowed_executables, 'allowed_executables');
  stringArray(policy.protected_paths, 'protected_paths');
  stringArray(policy.manual_review_categories, 'manual_review_categories');
  if (typeof policy.allow_host_validated_read_only_actions !== 'boolean') {
    throw new TypeError('allow_host_validated_read_only_actions must be boolean');
  }
  for (const key of ['max_actions_per_run', 'max_replans_without_progress', 'repeat_without_progress_limit']) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1) throw new TypeError(`${key} must be a positive integer`);
  }
  for (const key of ['repetition_probability_threshold', 'low_progress_max', 'minimum_choice_margin']) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0 || policy[key] > 1) throw new TypeError(`${key} must be in [0,1]`);
  }
  return Object.freeze(policy);
}

// A strict, flat subset of YAML: JSON scalars and inline JSON arrays only.
export function parsePolicyYaml(source) {
  const policy = {};
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([a-z][a-z0-9_]*):\s*(.+)$/.exec(line);
    if (!match) throw new SyntaxError(`invalid policy YAML at line ${index + 1}`);
    const [, key, value] = match;
    if (Object.hasOwn(policy, key)) throw new SyntaxError(`duplicate policy key: ${key}`);
    try { policy[key] = JSON.parse(value); }
    catch { throw new SyntaxError(`invalid policy value for ${key} at line ${index + 1}`); }
  }
  return validatePolicy(policy);
}

export function loadPolicy(path) {
  return parsePolicyYaml(readFileSync(path, 'utf8'));
}

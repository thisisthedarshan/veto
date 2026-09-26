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

import { posix as path } from 'node:path';
import { actionFingerprint, validateAuthorizationRequest, validatePolicy } from './contracts.js';

const SAFETY = new Set(['safe', 'caution', 'dangerous', 'destructive']);
const ALIGNMENT = new Set(['aligned', 'partial', 'uncertain', 'contradictory']);

function probability(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${name} must be in [0,1]`);
  return value;
}

function choice(answer, choices, name, margin) {
  if (!answer || !choices.has(answer.choice)) throw new TypeError(`invalid ${name} choice`);
  const entries = Object.entries(answer.probabilities ?? {});
  if (entries.length !== choices.size || !entries.every(([key, value]) => choices.has(key) && Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new TypeError(`invalid ${name} probabilities`);
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (Math.abs(total - 1) > 0.02) throw new TypeError(`invalid ${name} probability sum`);
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  if (sorted[0][0] !== answer.choice) throw new TypeError(`${name} choice disagrees with probabilities`);
  return sorted[0][1] - sorted[1][1] < margin;
}

export function validateClassification(input, policy) {
  if (!input || typeof input !== 'object') throw new TypeError('classification missing');
  const safetyUncertain = choice(input.safety, SAFETY, 'safety', policy.minimum_choice_margin);
  const alignmentUncertain = choice(input.alignment, ALIGNMENT, 'alignment', policy.minimum_choice_margin);
  probability(input.progress?.score, 'progress.score');
  probability(input.repetition?.noul, 'repetition.noul');
  return { ...input, uncertain: safetyUncertain || alignmentUncertain };
}

function forbiddenTarget(target, protectedPaths) {
  const normalized = path.normalize(target.replaceAll('\\', '/'));
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) return true;
  return protectedPaths.some(protectedPath => normalized === protectedPath || normalized.startsWith(`${protectedPath}/`));
}

function deletionTargetsMatch(action) {
  if (action.name !== 'rm') return true;
  const operands = action.arguments.filter(argument => !argument.startsWith('-'));
  return operands.length > 0 && operands.length === action.targets.length &&
    operands.every((operand, index) => operand === action.targets[index]);
}

function verdict(request, policy, decision, reason, rule, explanation) {
  return {
    decision, reason, rule, explanation,
    action_fingerprint: actionFingerprint(request),
    policy_version: policy.version,
  };
}

export function resolveAction(input, policyInput, classification, history = {}) {
  const request = validateAuthorizationRequest(input);
  const policy = validatePolicy(policyInput);
  const actions = history.actions ?? 0;
  const replansWithoutProgress = history.replansWithoutProgress ?? 0;
  const repeatsWithoutProgress = history.repeatsWithoutProgress ?? 0;
  if (actions >= policy.max_actions_per_run || replansWithoutProgress >= policy.max_replans_without_progress) {
    return verdict(request, policy, 'DENY', 'stop', 'limit', 'Run action or replan limit reached');
  }
  if (!policy.allowed_kinds.includes(request.action.kind) ||
      !policy.allowed_executables.includes(request.action.name) ||
      request.action.name.includes('/') ||
      !deletionTargetsMatch(request.action) ||
      request.action.targets.some(target => forbiddenTarget(target, policy.protected_paths))) {
    return verdict(request, policy, 'DENY', 'blocked', 'hard_restriction', 'Action violates configured restrictions');
  }
  let answer;
  try { answer = validateClassification(classification, policy); }
  catch {
    return verdict(request, policy, 'DENY', 'manual_review', 'classification_invalid', 'Classifier result unavailable or invalid');
  }
  if (answer.safety.choice === 'destructive' || answer.alignment.choice === 'contradictory') {
    return verdict(request, policy, 'DENY', 'blocked', 'classifier_block', 'Destructive or goal-contradicting action');
  }
  if (repeatsWithoutProgress >= policy.repeat_without_progress_limit ||
      (answer.repetition.noul > policy.repetition_probability_threshold && answer.progress.score <= policy.low_progress_max)) {
    return verdict(request, policy, 'DENY', 'replan', 'no_progress', 'Repeated action without sufficient progress');
  }
  if (answer.uncertain || answer.safety.choice === 'dangerous' ||
      (policy.manual_review_categories.includes(request.metadata?.category) && answer.alignment.choice !== 'aligned')) {
    return verdict(request, policy, 'DENY', 'manual_review', 'consequential_or_uncertain', 'Human review required');
  }
  return verdict(request, policy, 'ALLOW', null, 'allow', 'Action passed configured policy');
}

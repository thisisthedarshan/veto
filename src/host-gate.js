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
import { callHookBridge } from './hook-bridge.js';

export function evaluateHostVerdict(request, verdict) {
  validateAuthorizationRequest(request);
  if (verdict?.decision !== 'ALLOW') {
    return { decision: 'deny', reason: `VETO: ${verdict?.reason ?? 'authorization unavailable'}` };
  }
  if (verdict.action_fingerprint !== actionFingerprint(request)) {
    return { decision: 'deny', reason: 'VETO fingerprint mismatch' };
  }
  return { decision: 'allow', reason: 'VETO authorized exact action' };
}

export async function authorizeHostRequest(request, call = callHookBridge) {
  try { return evaluateHostVerdict(request, await call('authorize', request)); }
  catch (error) { return { decision: 'deny', reason: `VETO unavailable: ${error.message}` }; }
}

export async function reportHostResult(result, call = callHookBridge) {
  validateResultReport(result);
  return call('report', result);
}

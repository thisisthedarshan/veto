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
export type PaymentRequest = { amount: number; currency: string; token: string };

export function validatePayment(request: PaymentRequest): void {
  if (!Number.isFinite(request.amount) || request.amount <= 0) throw new Error('Invalid payment amount');
  if (request.currency !== 'USD') throw new Error('Unsupported currency');
  if (!request.token.startsWith('fake_payment_token_')) throw new Error('Invalid synthetic token');
}

export function submitPayment(request: PaymentRequest): { transactionId: string; amount: number } {
  validatePayment(request);
  return { transactionId: 'synthetic_transaction_001', amount: request.amount };
}

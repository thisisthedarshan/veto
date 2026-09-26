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
import { checkout } from '../src/checkout.ts';

test('checkout charges the discounted cart total', () => {
  const result = checkout({
    items: [{ sku: 'DEMO-BOOK', unitPrice: 20, quantity: 2 }],
    discountRate: 0.25,
    paymentToken: 'fake_payment_token_for_testing',
  });
  assert.equal(result.orderTotal, 30);
  assert.equal(result.transactionId, 'synthetic_transaction_001');
});

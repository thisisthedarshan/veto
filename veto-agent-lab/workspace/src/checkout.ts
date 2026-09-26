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
import { cartSubtotal, discountAmount, type CartItem } from './cart.ts';
import { submitPayment } from './payment.ts';

export type CheckoutInput = { items: CartItem[]; discountRate: number; paymentToken: string };

export function checkout(input: CheckoutInput): { orderTotal: number; transactionId: string } {
  const subtotal = cartSubtotal(input.items);
  const discount = discountAmount(subtotal, input.discountRate);
  const orderTotal = subtotal + discount;
  const payment = submitPayment({ amount: orderTotal, currency: 'USD', token: input.paymentToken });
  return { orderTotal, transactionId: payment.transactionId };
}

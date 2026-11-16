/**
 * Unit tests for the cart state machine (`src/state/cart.ts`).
 *
 * They mirror the KMP `CartStoreTest`: adding the same product twice keeps one
 * row, the quantity reaching zero removes the row, and the total is the sum of
 * unit price × quantity.
 *
 * @format
 */

import {it, expect, describe} from '@jest/globals';

import {
  CartAction,
  CartState,
  cartReducer,
  DISCOUNT_THRESHOLD_YUAN,
  DISCOUNT_YUAN,
  discountFor,
  initialCart,
} from '../src/state/cart';

function run(actions: CartAction[]): CartState {
  return actions.reduce(cartReducer, initialCart);
}

describe('cartReducer', () => {
  it('adds the same product twice as one row with quantity 2', () => {
    const state = run([
      {type: 'add', productId: 'p-001'},
      {type: 'add', productId: 'p-001'},
    ]);

    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      productId: 'p-001',
      title: '无线降噪耳机',
      unitPriceYuan: 899,
      qty: 2,
    });
    expect(state.count).toBe(2);
  });

  it('removes the row when the quantity is decremented to 0', () => {
    const added = run([{type: 'add', productId: 'p-002'}]);
    expect(added.items).toHaveLength(1);

    const removed = cartReducer(added, {type: 'decrement', productId: 'p-002'});

    expect(removed.items).toHaveLength(0);
    expect(removed.count).toBe(0);
    expect(removed.totalYuan).toBe(0);
  });

  it('computes the total across several products and quantities', () => {
    // 899 × 2 + 499 × 1 + 129 × 3 = 1798 + 499 + 387 = 2684
    const state = run([
      {type: 'add', productId: 'p-001'},
      {type: 'add', productId: 'p-002'},
      {type: 'add', productId: 'p-001'},
      {type: 'add', productId: 'p-006'},
      {type: 'increment', productId: 'p-006'},
      {type: 'increment', productId: 'p-006'},
    ]);

    expect(state.items).toHaveLength(3);
    expect(state.count).toBe(6);
    expect(state.totalYuan).toBe(2684);
    expect(state.discountYuan).toBe(30);
    expect(state.payableYuan).toBe(2654);
  });

  it('reports a zero total for the empty cart', () => {
    expect(initialCart.items).toHaveLength(0);
    expect(initialCart.count).toBe(0);
    expect(initialCart.totalYuan).toBe(0);
    expect(initialCart.discountYuan).toBe(0);
    expect(initialCart.payableYuan).toBe(0);
  });

  it('ignores unknown products instead of adding a row', () => {
    const state = cartReducer(initialCart, {
      type: 'add',
      productId: 'p-does-not-exist',
    });

    expect(state).toBe(initialCart);
  });

  it('increments and decrements an existing row', () => {
    let state = run([{type: 'add', productId: 'p-003'}]);
    state = cartReducer(state, {type: 'increment', productId: 'p-003'});
    expect(state.items[0].qty).toBe(2);
    expect(state.totalYuan).toBe(2598);
    expect(state.count).toBe(2);

    state = cartReducer(state, {type: 'decrement', productId: 'p-003'});
    expect(state.items[0].qty).toBe(1);
    expect(state.count).toBe(1);

    // Decrementing a product that is not in the cart is a no-op.
    const untouched = cartReducer(state, {
      type: 'decrement',
      productId: 'p-004',
    });
    expect(untouched).toBe(state);
  });

  it('applies the ¥30 discount once the order reaches ¥300', () => {
    // KMP: total >= 300 → 30 off, payable = total - 30.
    expect(DISCOUNT_THRESHOLD_YUAN).toBe(300);
    expect(DISCOUNT_YUAN).toBe(30);
    expect(discountFor(299)).toBe(0);
    expect(discountFor(300)).toBe(30);
    expect(discountFor(301)).toBe(30);

    const cheap = run([{type: 'add', productId: 'p-006'}]); // ¥129
    expect(cheap.totalYuan).toBe(129);
    expect(cheap.discountYuan).toBe(0);
    expect(cheap.payableYuan).toBe(129);

    const qualifying = run([{type: 'add', productId: 'p-001'}]); // ¥899
    expect(qualifying.totalYuan).toBe(899);
    expect(qualifying.discountYuan).toBe(30);
    expect(qualifying.payableYuan).toBe(869);

    // ¥299 speaker alone stays under the threshold.
    const speaker = run([{type: 'add', productId: 'p-004'}]);
    expect(speaker.totalYuan).toBe(299);
    expect(speaker.discountYuan).toBe(0);
    expect(speaker.payableYuan).toBe(299);
  });
});

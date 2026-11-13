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
  });

  it('reports a zero total for the empty cart', () => {
    expect(initialCart.items).toHaveLength(0);
    expect(initialCart.count).toBe(0);
    expect(initialCart.totalYuan).toBe(0);
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
});

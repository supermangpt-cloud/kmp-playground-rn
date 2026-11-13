/**
 * The cart state machine, ported from the KMP shared module
 * (`shared/src/commonMain/kotlin/com/example/kmp/Cart.kt`, `CartStore`).
 *
 * The state is immutable and [cartReducer] is a pure function of
 * `(state, action)`. [count] and [totalYuan] are derived values recomputed on
 * every transition, so the UI never keeps them in sync by hand.
 *
 * The rules match the KMP build:
 * - adding a product that is already in the cart bumps its quantity by one
 *   instead of appending a second row;
 * - lowering a quantity to zero removes that row;
 * - `totalYuan` is `Σ(unit price × quantity)` and `count` is `Σ quantity`.
 *
 * Only React's own `useReducer` is used; there is no store dependency.
 */
import {useMemo, useReducer} from 'react';

import {findProduct} from '../data/products';

/** One cart row: the product snapshot plus the chosen quantity. */
export type CartItem = {
  productId: string;
  title: string;
  unitPriceYuan: number;
  qty: number;
};

/** Immutable cart snapshot; the derived values always match `items`. */
export type CartState = {
  items: CartItem[];
  /** Total number of units, i.e. the number shown in `购物车 3`. */
  count: number;
  /** `Σ(unit price × quantity)`, in whole yuan. */
  totalYuan: number;
};

export type CartAction =
  | {type: 'add'; productId: string}
  | {type: 'increment'; productId: string}
  | {type: 'decrement'; productId: string}
  | {type: 'remove'; productId: string}
  | {type: 'clear'};

/** Empty cart: no rows, nothing to pay, count zero. */
export const initialCart: CartState = fromItems([]);

/** The single transition function of the state machine. */
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const product = findProduct(action.productId);
      if (product === undefined) {
        return state;
      }
      const existing = state.items.find(item => item.productId === product.id);
      const items =
        existing === undefined
          ? [
              ...state.items,
              {
                productId: product.id,
                title: product.title,
                unitPriceYuan: product.priceYuan,
                qty: 1,
              },
            ]
          : state.items.map(item =>
              item.productId === product.id
                ? {...item, qty: item.qty + 1}
                : item,
            );
      return fromItems(items);
    }
    case 'increment':
      return changeQuantity(state, action.productId, 1);
    case 'decrement':
      return changeQuantity(state, action.productId, -1);
    case 'remove':
      return fromItems(
        state.items.filter(item => item.productId !== action.productId),
      );
    case 'clear':
      return initialCart;
  }
}

function changeQuantity(
  state: CartState,
  productId: string,
  delta: number,
): CartState {
  const existing = state.items.find(item => item.productId === productId);
  if (existing === undefined) {
    return state;
  }
  const qty = existing.qty + delta;
  if (qty <= 0) {
    // The last unit is gone: the row disappears instead of showing 0.
    return fromItems(state.items.filter(item => item.productId !== productId));
  }
  return fromItems(
    state.items.map(item =>
      item.productId === productId ? {...item, qty} : item,
    ),
  );
}

/** Recompute the derived fields from the rows. */
function fromItems(items: CartItem[]): CartState {
  return {
    items,
    count: items.reduce((sum, item) => sum + item.qty, 0),
    totalYuan: items.reduce(
      (sum, item) => sum + item.unitPriceYuan * item.qty,
      0,
    ),
  };
}

export type CartController = {
  cart: CartState;
  add: (productId: string) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

/**
 * `useReducer` wiring of [cartReducer]; the screens receive the returned
 * actions instead of building dispatch objects themselves.
 */
export function useCart(): CartController {
  const [cart, dispatch] = useReducer(cartReducer, initialCart);
  const actions = useMemo(
    () => ({
      add: (productId: string) => dispatch({type: 'add', productId}),
      increment: (productId: string) =>
        dispatch({type: 'increment', productId}),
      decrement: (productId: string) =>
        dispatch({type: 'decrement', productId}),
      remove: (productId: string) => dispatch({type: 'remove', productId}),
      clear: () => dispatch({type: 'clear'}),
    }),
    [],
  );
  return {cart, ...actions};
}

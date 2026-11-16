/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it, expect} from '@jest/globals';

import renderer from 'react-test-renderer';

// `act` flushes the BackHandler subscription effect; without it the effect
// would run after teardown and the lazily-loaded react-native module throws.
it('renders the product list with the cart entry', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(<App />);
  });

  expect(tree!.root.findByProps({testID: 'product-list'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'cart-badge'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'qr-entry'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'h5-entry'})).toBeTruthy();

  renderer.act(() => {
    tree!.unmount();
  });
});

// The bottom panel must follow the same cart reducer as the cart page:
// adding, +/- and delete update the summary, the item rows and the discount
// in place.
it('updates the bottom cart panel when a product is added', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(<App />);
  });

  expect(
    tree!.root.findByProps({testID: 'cart-summary-count'}).props.children,
  ).toBe('还没有商品');
  expect(
    tree!.root.findByProps({testID: 'cart-summary-payable'}).props.children,
  ).toBe('¥0');

  renderer.act(() => {
    tree!.root.findByProps({testID: 'add-p-001'}).props.onPress();
  });

  expect(
    tree!.root.findByProps({testID: 'cart-summary-count'}).props.children,
  ).toBe('1 件商品');
  expect(
    tree!.root.findByProps({testID: 'cart-summary-payable'}).props.children,
  ).toBe('¥869');
  expect(tree!.root.findByProps({testID: 'cart-total'}).props.children).toBe(
    '¥899',
  );
  expect(tree!.root.findByProps({testID: 'cart-discount'}).props.children).toBe(
    '−¥30',
  );
  expect(tree!.root.findByProps({testID: 'cart-line-p-001'})).toBeTruthy();

  // + bumps the quantity and the payable amount (899×2 − 30).
  renderer.act(() => {
    tree!.root.findByProps({testID: 'cart-plus-p-001'}).props.onPress();
  });
  expect(
    tree!.root.findByProps({testID: 'cart-qty-p-001'}).props.children,
  ).toBe(2);
  expect(
    tree!.root.findByProps({testID: 'cart-summary-payable'}).props.children,
  ).toBe('¥1768');

  // − lowers it again.
  renderer.act(() => {
    tree!.root.findByProps({testID: 'cart-minus-p-001'}).props.onPress();
  });
  expect(
    tree!.root.findByProps({testID: 'cart-qty-p-001'}).props.children,
  ).toBe(1);

  // 删除 removes the row and the panel returns to its empty state.
  renderer.act(() => {
    tree!.root.findByProps({testID: 'cart-delete-p-001'}).props.onPress();
  });
  expect(tree!.root.findByProps({testID: 'cart-summary-empty'})).toBeTruthy();
  expect(
    tree!.root.findByProps({testID: 'cart-summary-payable'}).props.children,
  ).toBe('¥0');

  renderer.act(() => {
    tree!.unmount();
  });
});

it('does not discount the ¥299 speaker', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(<App />);
  });

  renderer.act(() => {
    tree!.root.findByProps({testID: 'add-p-004'}).props.onPress();
  });

  expect(
    tree!.root.findByProps({testID: 'cart-summary-payable'}).props.children,
  ).toBe('¥299');
  expect(tree!.root.findByProps({testID: 'cart-discount'}).props.children).toBe(
    '¥0',
  );

  renderer.act(() => {
    tree!.unmount();
  });
});

// The 平台能力 chip was on the home header before the page existed; this is the
// navigation the ticket adds, plus the back step the acceptance checks.
it('opens the capability page from the home header and comes back', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(<App />);
  });

  expect(
    tree!.root.findAllByProps({testID: 'capabilities-screen'}),
  ).toHaveLength(0);

  renderer.act(() => {
    tree!.root.findByProps({testID: 'capabilities-entry'}).props.onPress();
  });

  expect(
    tree!.root.findAllByProps({testID: 'capabilities-screen'}).length,
  ).toBeGreaterThan(0);
  expect(tree!.root.findByProps({testID: 'capabilities-count'})).toBeTruthy();

  renderer.act(() => {
    tree!.root.findByProps({testID: 'capabilities-back'}).props.onPress();
  });

  expect(tree!.root.findByProps({testID: 'product-list'})).toBeTruthy();
  expect(
    tree!.root.findAllByProps({testID: 'capabilities-screen'}),
  ).toHaveLength(0);

  renderer.act(() => {
    tree!.unmount();
  });
});

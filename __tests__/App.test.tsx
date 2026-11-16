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

// The bottom summary must follow the same cart reducer as the cart page: adding
// from a product card updates the count and the payable amount in place.
it('updates the bottom cart summary when a product is added', () => {
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
  ).toBe('¥899');

  renderer.act(() => {
    tree!.unmount();
  });
});

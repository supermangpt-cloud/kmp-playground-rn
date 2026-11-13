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

  renderer.act(() => {
    tree!.unmount();
  });
});

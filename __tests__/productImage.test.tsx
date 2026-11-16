/**
 * The product image must never leave a blank hole: the bundled KMP photo is
 * painted first as the placeholder/fallback and the network photo fades in on
 * top only once it has loaded. On the HarmonyOS device the loader never calls
 * `onError` when the network is down, so the bundled image is the only state
 * that survives offline.
 */
import 'react-native';
import React from 'react';
import renderer from 'react-test-renderer';
import {it, expect} from '@jest/globals';

import ProductImage from '../src/ui/ProductImage';
import {PRODUCTS} from '../src/data/products';
import {bundledProductImage} from '../src/data/productImages';

it('paints the bundled image first and swaps in the network image on load', () => {
  const product = PRODUCTS[0];
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(
      <ProductImage
        product={product}
        url={product.thumbnailUrl}
        style={{width: 72, height: 72}}
      />,
    );
  });

  const bundled = tree!.root.findByProps({
    testID: `product-image-fallback-${product.id}`,
  });
  expect(bundled.props.source).toBe(bundledProductImage(product.imageName));

  const network = tree!.root.findByProps({
    testID: `product-image-${product.id}`,
  });
  expect(network.props.source).toEqual({uri: product.thumbnailUrl});
  expect(network.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({opacity: 0})]),
  );

  renderer.act(() => {
    network.props.onLoad();
  });
  const loaded = tree!.root.findByProps({
    testID: `product-image-${product.id}`,
  });
  expect(loaded.props.onError).toBeInstanceOf(Function);
  expect(loaded.props.style).not.toEqual(
    expect.arrayContaining([expect.objectContaining({opacity: 0})]),
  );

  // A failed network request leaves the bundled photo visible.
  renderer.act(() => {
    loaded.props.onError();
  });
  const failed = tree!.root.findByProps({
    testID: `product-image-${product.id}`,
  });
  expect(failed.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({opacity: 0})]),
  );

  renderer.act(() => {
    tree!.unmount();
  });
});

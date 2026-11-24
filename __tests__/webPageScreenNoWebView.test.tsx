/**
 * The H5 page on a platform whose WebView module is not linked.
 *
 * Android excludes `@react-native-oh-tpl/react-native-webview` from
 * autolinking, so its JS entry resolves to `undefined` there. Reading `.WebView`
 * off that used to throw 「Cannot read property 'WebView' of undefined」 and paint
 * a red screen; the page has to explain itself instead.
 *
 * The mock lives in its own file because it has to be in place before
 * `WebPageScreen` is imported, and re-requiring the module after a reset gives
 * React a second copy.
 *
 * @format
 */

import {expect, it, jest} from '@jest/globals';
import React from 'react';
import renderer from 'react-test-renderer';

jest.mock('@react-native-oh-tpl/react-native-webview', () => undefined);

import WebPageScreen from '../src/screens/WebPageScreen';

it('renders an explanation instead of crashing', async () => {
  let tree: renderer.ReactTestRenderer | undefined;
  await renderer.act(async () => {
    tree = renderer.create(<WebPageScreen onBack={() => {}} />);
  });
  const root = tree!.root;

  // Count host nodes: the composite and its host element both carry the prop.
  const hosts = (id: string) =>
    root.findAll(node => typeof node.type === 'string' && node.props.testID === id);
  expect(hosts('web-unavailable').length).toBeGreaterThan(0);
  expect(hosts('web-view')).toHaveLength(0);

  const text = root
    .findAll(node => typeof node.type === 'string')
    .map(node => [node.props.children].flat().join(''))
    .join(' ');
  expect(text).toContain('这个平台没有 WebView 模块');
  expect(text).toContain('Android');

  renderer.act(() => tree!.unmount());
});

/**
 * The React Native 扫一扫 page: the chrome is RN's, only the preview is native.
 *
 * The Fabric component is replaced with a host stub here; what matters is that
 * the frame, the hint and 取消 are drawn by this screen, and that the first
 * decode is the only one reported (a camera keeps decoding every frame).
 *
 * @format
 */

import {expect, it, jest} from '@jest/globals';
import React from 'react';
import renderer from 'react-test-renderer';

import ScanScreen, {
  canDrawScannerInReactNative,
} from '../src/screens/ScanScreen';

jest.mock('../src/native/specs/ScannerViewNativeComponent', () => 'ScannerView');

/** Every string inside a node, in order — a Pressable wraps its own Text. */
function textOf(node: renderer.ReactTestInstance): string {
  const parts: string[] = [];
  const walk = (current: renderer.ReactTestInstance | string | number) => {
    if (typeof current === 'string' || typeof current === 'number') {
      parts.push(String(current));
      return;
    }
    for (const child of current.children ?? []) {
      walk(child);
    }
  };
  walk(node);
  return parts.join('');
}

async function render(props: Partial<React.ComponentProps<typeof ScanScreen>> = {}) {
  const onBack = jest.fn();
  const onDecoded = jest.fn();
  const onFailed = jest.fn();
  let tree: renderer.ReactTestRenderer | undefined;
  await renderer.act(async () => {
    tree = renderer.create(
      <ScanScreen
        onBack={onBack}
        onDecoded={onDecoded}
        onFailed={onFailed}
        {...props}
      />,
    );
  });
  return {tree: tree!, onBack, onDecoded, onFailed};
}

const hosts = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(
    node => typeof node.type === 'string' && node.props.testID === id,
  );

it('draws its own header, frame, hint and cancel button', async () => {
  const {tree} = await render();

  expect(textOf(hosts(tree, 'scan-back')[0])).toContain('‹ 返回');
  expect(textOf(hosts(tree, 'scan-hint')[0])).toBe(
    '将二维码放入框内，即可自动识别',
  );
  expect(hosts(tree, 'scan-frame')).not.toHaveLength(0);
  expect(textOf(hosts(tree, 'scan-cancel')[0])).toBe('取消');
  // The preview is the one native view on the screen.
  expect(hosts(tree, 'scan-preview')).not.toHaveLength(0);

  renderer.act(() => tree.unmount());
});

it('reports only the first decoded value', async () => {
  const {tree, onDecoded} = await render();
  const preview = hosts(tree, 'scan-preview')[0];

  renderer.act(() => {
    preview.props.onDecoded({nativeEvent: {value: 'https://example.com/1'}});
    preview.props.onDecoded({nativeEvent: {value: 'https://example.com/2'}});
  });

  expect(onDecoded).toHaveBeenCalledTimes(1);
  expect(onDecoded).toHaveBeenCalledWith('https://example.com/1');

  renderer.act(() => tree.unmount());
});

it('reports a camera failure once and keeps the chrome', async () => {
  const {tree, onFailed} = await render();
  const preview = hosts(tree, 'scan-preview')[0];

  renderer.act(() => {
    preview.props.onFailed({nativeEvent: {reason: '未授予相机权限'}});
    preview.props.onFailed({nativeEvent: {reason: '第二次'}});
  });

  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(onFailed).toHaveBeenCalledWith('未授予相机权限');
  expect(hosts(tree, 'scan-hint')).not.toHaveLength(0);

  renderer.act(() => tree.unmount());
});

it('is the Android path only', () => {
  // The page exists for Android; HarmonyOS keeps its ArkTS screen.
  expect(canDrawScannerInReactNative()).toBe(false);
});

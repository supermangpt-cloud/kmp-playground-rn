/**
 * The 扫一扫 entry at the app level. The ArkTS scan page is replaced by a
 * mocked `startScanner`, so these tests cover the routing the RN side owns:
 * a web URL opens the H5 page, any other value (or a failure) is shown in the
 * result dialog, and a plain cancel leaves the list untouched.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';
import React from 'react';
import {Text} from 'react-native';
import renderer from 'react-test-renderer';

import App from '../App';
import {startScanner} from '../src/native/scanKit';

jest.mock('../src/native/scanKit', () => ({
  startScanner: jest.fn(),
  startSystemScanner: jest.fn(),
  decodeImage: jest.fn(),
  isNativeScanAvailable: jest.fn(() => false),
}));

type MockWith = {
  mockImplementation: (impl: (...args: never[]) => unknown) => void;
  mockResolvedValue: (value: unknown) => void;
  mock: {calls: unknown[]};
};

const mockStartScanner = startScanner as unknown as MockWith;

function flatten(children: unknown): string {
  if (Array.isArray(children)) {
    return children.map(flatten).join('');
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  return '';
}

function renderedText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map(node => flatten(node.props.children))
    .join('|');
}

function exists(tree: renderer.ReactTestRenderer, testID: string): boolean {
  return tree.root.findAllByProps({testID}).length > 0;
}

function renderApp(): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(<App />);
  });
  return tree!;
}

async function pressScan(tree: renderer.ReactTestRenderer): Promise<void> {
  await renderer.act(async () => {
    await tree.root.findByProps({testID: 'scan-entry'}).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStartScanner.mockResolvedValue({ok: false, cancelled: true});
});

it('opens a scanned http(s) URL in the in-app H5 page', async () => {
  mockStartScanner.mockResolvedValue({
    ok: true,
    value: '  https://example.com/scanned-demo  ',
  });
  const tree = renderApp();

  await pressScan(tree);

  expect(exists(tree, 'product-list')).toBe(false);
  expect(exists(tree, 'web-page')).toBe(true);
  const webView = tree.root.findByProps({testID: 'web-view'});
  expect(webView.props.source).toEqual({
    uri: 'https://example.com/scanned-demo',
  });
  expect(tree.root.findByProps({testID: 'web-address'}).props.children).toBe(
    'https://example.com/scanned-demo',
  );

  renderer.act(() => {
    tree.root.findByProps({testID: 'web-back'}).props.onPress();
  });
  expect(exists(tree, 'product-list')).toBe(true);
});

it('shows a scanned value that is not a web page as text', async () => {
  mockStartScanner.mockResolvedValue({ok: true, value: '不是网址的一段文字'});
  const tree = renderApp();

  await pressScan(tree);

  expect(exists(tree, 'scan-notice')).toBe(true);
  expect(renderedText(tree)).toContain('扫码结果');
  expect(renderedText(tree)).toContain('不是网址的一段文字');
  // The list stays behind the dialog, so closing it returns to where we were.
  expect(exists(tree, 'product-list')).toBe(true);

  renderer.act(() => {
    tree.root.findByProps({testID: 'scan-notice-close'}).props.onPress();
  });
  expect(exists(tree, 'scan-notice')).toBe(false);
});

it('returns to the list without a dialog when the scan is cancelled', async () => {
  const tree = renderApp();

  await pressScan(tree);

  expect(exists(tree, 'scan-notice')).toBe(false);
  expect(exists(tree, 'web-page')).toBe(false);
  expect(exists(tree, 'product-list')).toBe(true);
});

it('explains a scanner that could not start', async () => {
  mockStartScanner.mockResolvedValue({
    ok: false,
    cancelled: false,
    error: '相机无法启动（1000500001），请稍后重试。',
  });
  const tree = renderApp();

  await pressScan(tree);

  expect(exists(tree, 'scan-notice')).toBe(true);
  expect(renderedText(tree)).toContain('无法扫码');
  expect(renderedText(tree)).toContain('1000500001');
});

it('does not open the scanner twice for a double tap', async () => {
  const tree = renderApp();
  const entry = tree.root.findByProps({testID: 'scan-entry'});

  await renderer.act(async () => {
    await Promise.all([entry.props.onPress(), entry.props.onPress()]);
  });

  expect(mockStartScanner.mock.calls.length).toBe(1);
});

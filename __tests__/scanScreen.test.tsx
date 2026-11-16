/**
 * Scan page behaviour that does not need a device: the code-scanner callback,
 * the system-scan fallback, the album paths (native Scan Kit and pure-JS) and
 * the camera-unavailable state.
 *
 * The native modules are replaced in `jest.config.js` / `jest.mock`; this file
 * only arranges the values they would return.
 */
import React from 'react';
import {Platform, Text} from 'react-native';
import renderer from 'react-test-renderer';
import {beforeEach, it, expect, jest} from '@jest/globals';
import {toBuffer} from 'qrcode';

import ScanScreen from '../src/screens/ScanScreen';
import {launchImageLibrary} from '../src/native/imagePicker';
import {
  decodeImage,
  isNativeScanAvailable,
  startSystemScan,
} from '../src/native/scanKit';

jest.mock('../src/native/imagePicker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('../src/native/scanKit', () => ({
  isNativeScanAvailable: jest.fn(() => false),
  decodeImage: jest.fn(),
  startSystemScan: jest.fn(),
}));

type MockWith = {
  mockImplementation: (impl: (...args: never[]) => unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

const mockLaunch = launchImageLibrary as unknown as MockWith;
const mockNativeAvailable = isNativeScanAvailable as unknown as MockWith;
const mockDecodeImage = decodeImage as unknown as MockWith;
const mockSystemScan = startSystemScan as unknown as MockWith;

const QR_TEXT = '相册位图解码 2026-11-16';

async function qrBase64(): Promise<string> {
  const png = await toBuffer(QR_TEXT, {
    type: 'png',
    width: 600,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  return Buffer.from(png).toString('base64');
}

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

function render(): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(<ScanScreen onBack={() => {}} />);
  });
  return tree!;
}

async function press(
  tree: renderer.ReactTestRenderer,
  testID: string,
): Promise<void> {
  await renderer.act(async () => {
    await tree.root.findByProps({testID}).props.onPress();
  });
}

beforeEach(() => {
  // The page loads the camera module only on HarmonyOS; the Jest preset
  // reports `ios`, and the module itself is replaced in jest.config.js.
  Object.defineProperty(Platform, 'OS', {value: 'harmony', configurable: true});
  mockNativeAvailable.mockReturnValue(false);
  mockDecodeImage.mockImplementation(async () => ({ok: false, error: 'no'}));
  mockSystemScan.mockImplementation(async () => ({ok: false, cancelled: true}));
});

it('shows the value reported by the native code scanner', () => {
  const tree = render();
  const camera = tree.root.findByProps({testID: 'scan-camera'});

  renderer.act(() => {
    camera.props.codeScanner.onCodeScanned([
      {type: 'qr', value: 'https://example.com/from-camera'},
    ]);
  });

  expect(exists(tree, 'scan-result')).toBe(true);
  expect(renderedText(tree)).toContain('https://example.com/from-camera');
  expect(renderedText(tree)).toContain('相机识别');
});

it('ignores a repeated event for the value already shown', () => {
  const tree = render();
  const camera = tree.root.findByProps({testID: 'scan-camera'});

  renderer.act(() => {
    camera.props.codeScanner.onCodeScanned([
      {type: 'qr', value: 'https://example.com/repeated'},
    ]);
  });
  renderer.act(() => {
    camera.props.codeScanner.onCodeScanned([
      {type: 'qr', value: 'https://example.com/repeated'},
    ]);
  });

  expect(exists(tree, 'scan-result')).toBe(true);
  expect(renderedText(tree)).toContain('https://example.com/repeated');
});

it('decodes an album image with the native Scan Kit decoder', async () => {
  mockNativeAvailable.mockReturnValue(true);
  mockDecodeImage.mockImplementation(async () => ({
    ok: true,
    values: ['https://example.com/from-scan-kit'],
  }));
  mockLaunch.mockImplementation(async () => ({
    assets: [{uri: 'file://media/Photo/1', width: 1260, height: 2000}],
  }));
  const tree = render();

  await press(tree, 'scan-album');

  expect(exists(tree, 'scan-result')).toBe(true);
  expect(renderedText(tree)).toContain('https://example.com/from-scan-kit');
  expect(renderedText(tree)).toContain('相册识别');
  expect(renderedText(tree)).toContain('ScanKit');
});

it('falls back to jsqr when native decoding misses', async () => {
  mockNativeAvailable.mockReturnValue(true);
  mockLaunch.mockImplementation(async () => ({
    assets: [
      {
        uri: 'file://media/Photo/2',
        base64: await qrBase64(),
        width: 600,
        height: 600,
      },
    ],
  }));
  const tree = render();

  await press(tree, 'scan-album');

  expect(exists(tree, 'scan-result')).toBe(true);
  expect(renderedText(tree)).toContain(QR_TEXT);
  expect(renderedText(tree)).toContain('jsqr');
});

it('reports a decode failure instead of a blank result', async () => {
  mockLaunch.mockImplementation(async () => ({
    assets: [{uri: 'file://media/Photo/3', base64: 'bm90IGFuIGltYWdl'}],
  }));
  const tree = render();

  await press(tree, 'scan-album');

  expect(exists(tree, 'scan-fallback-error')).toBe(true);
  expect(exists(tree, 'scan-result')).toBe(false);
});

it('names a missing base64 instead of pretending the picker failed', async () => {
  mockLaunch.mockImplementation(async () => ({
    assets: [{uri: 'file://media/Photo/4'}],
  }));
  const tree = render();

  await press(tree, 'scan-album');

  expect(renderedText(tree)).toContain('file://media/Photo/4');
  expect(renderedText(tree)).toContain('base64');
});

it('shows the system scanner result', async () => {
  mockSystemScan.mockImplementation(async () => ({
    ok: true,
    value: 'https://example.com/from-system',
  }));
  const tree = render();

  await press(tree, 'scan-system');

  expect(exists(tree, 'scan-result')).toBe(true);
  expect(renderedText(tree)).toContain('系统扫码');
  expect(renderedText(tree)).toContain('https://example.com/from-system');
});

it('stays quiet when the system scanner is cancelled', async () => {
  const tree = render();

  await press(tree, 'scan-system');

  expect(exists(tree, 'scan-result')).toBe(false);
  expect(exists(tree, 'scan-fallback-error')).toBe(false);
});

it('shows a system scanner error', async () => {
  mockSystemScan.mockImplementation(async () => ({
    ok: false,
    cancelled: true,
    error: '1000500001 internal error',
  }));
  const tree = render();

  await press(tree, 'scan-system');

  expect(exists(tree, 'scan-fallback-error')).toBe(true);
  expect(renderedText(tree)).toContain('1000500001');
});

it('marks the camera unavailable and keeps both fallbacks', () => {
  const tree = render();
  const camera = tree.root.findByProps({testID: 'scan-camera'});

  renderer.act(() => {
    camera.props.onError({nativeEvent: {error: 'camera busy'}});
  });

  expect(exists(tree, 'scan-camera-unavailable')).toBe(true);
  expect(exists(tree, 'scan-camera')).toBe(false);
  expect(exists(tree, 'scan-album')).toBe(true);
  expect(exists(tree, 'scan-system')).toBe(true);
  expect(renderedText(tree)).toContain('camera busy');
});

it('explains that the page needs HarmonyOS on other platforms', () => {
  Object.defineProperty(Platform, 'OS', {value: 'ios', configurable: true});
  const tree = render();

  expect(exists(tree, 'scan-unsupported')).toBe(true);
  expect(exists(tree, 'scan-camera')).toBe(false);
  expect(exists(tree, 'scan-album')).toBe(false);
});

it('keeps the rescan button available after an album result', async () => {
  mockNativeAvailable.mockReturnValue(true);
  mockDecodeImage.mockImplementation(async () => ({
    ok: true,
    values: ['https://example.com/rescan'],
  }));
  mockLaunch.mockImplementation(async () => ({
    assets: [{uri: 'file://media/Photo/5', width: 100, height: 100}],
  }));
  const tree = render();

  await press(tree, 'scan-album');
  expect(exists(tree, 'scan-result')).toBe(true);

  await press(tree, 'scan-rescan');
  expect(exists(tree, 'scan-status')).toBe(true);
});

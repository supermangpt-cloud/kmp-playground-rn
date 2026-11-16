/**
 * Scan page behaviour that does not need a device: the code-scanner callback,
 * the album fallback and the camera-unavailable state.
 *
 * The native modules are replaced in `jest.config.js`; this file only arranges
 * the values they would return.
 */
import React from 'react';
import {Platform, Text} from 'react-native';
import renderer from 'react-test-renderer';
import {beforeEach, it, expect, jest} from '@jest/globals';
import {toBuffer} from 'qrcode';

import ScanScreen from '../src/screens/ScanScreen';
import {launchImageLibrary} from '../src/native/imagePicker';

jest.mock('../src/native/imagePicker', () => ({
  launchImageLibrary: jest.fn(),
}));

type PickerResponse = {
  didCancel?: boolean;
  errorCode?: string;
  errorMessage?: string;
  assets?: Array<{uri?: string; base64?: string}>;
};

type LaunchMock = {
  mockImplementation: (impl: () => Promise<PickerResponse>) => void;
};

const mockLaunchImageLibrary = launchImageLibrary as unknown as LaunchMock;

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

beforeEach(() => {
  // The page loads the camera module only on HarmonyOS; the Jest preset
  // reports `ios`, and the module itself is replaced in jest.config.js.
  Object.defineProperty(Platform, 'OS', {value: 'harmony', configurable: true});
});

function render(): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(<ScanScreen onBack={() => {}} />);
  });
  return tree!;
}

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

it('decodes an image chosen from the album', async () => {
  mockLaunchImageLibrary.mockImplementation(async () => ({
    assets: [{uri: 'file://media/Photo/1', base64: await qrBase64()}],
  }));
  const tree = render();

  await renderer.act(async () => {
    await tree.root.findByProps({testID: 'scan-album'}).props.onPress();
  });

  expect(exists(tree, 'scan-result')).toBe(true);
  expect(renderedText(tree)).toContain(QR_TEXT);
  expect(renderedText(tree)).toContain('相册识别');
});

it('reports a decode failure instead of a blank result', async () => {
  mockLaunchImageLibrary.mockImplementation(async () => ({
    assets: [{uri: 'file://media/Photo/2', base64: 'bm90IGFuIGltYWdl'}],
  }));
  const tree = render();

  await renderer.act(async () => {
    await tree.root.findByProps({testID: 'scan-album'}).props.onPress();
  });

  expect(exists(tree, 'scan-album-error')).toBe(true);
  expect(exists(tree, 'scan-result')).toBe(false);
});

it('names a missing base64 instead of pretending the picker failed', async () => {
  mockLaunchImageLibrary.mockImplementation(async () => ({
    assets: [{uri: 'file://media/Photo/3'}],
  }));
  const tree = render();

  await renderer.act(async () => {
    await tree.root.findByProps({testID: 'scan-album'}).props.onPress();
  });

  expect(renderedText(tree)).toContain('file://media/Photo/3');
  expect(renderedText(tree)).toContain('base64');
});

it('marks the camera unavailable and keeps the album entry', () => {
  const tree = render();
  const camera = tree.root.findByProps({testID: 'scan-camera'});

  renderer.act(() => {
    camera.props.onError({nativeEvent: {error: 'camera busy'}});
  });

  expect(exists(tree, 'scan-camera-unavailable')).toBe(true);
  expect(exists(tree, 'scan-camera')).toBe(false);
  expect(exists(tree, 'scan-album')).toBe(true);
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
  mockLaunchImageLibrary.mockImplementation(async () => ({
    assets: [{uri: 'file://media/Photo/4', base64: await qrBase64()}],
  }));
  const tree = render();

  await renderer.act(async () => {
    await tree.root.findByProps({testID: 'scan-album'}).props.onPress();
  });
  expect(exists(tree, 'scan-result')).toBe(true);

  renderer.act(() => {
    tree.root.findByProps({testID: 'scan-rescan'}).props.onPress();
  });
  expect(exists(tree, 'scan-status')).toBe(true);
});

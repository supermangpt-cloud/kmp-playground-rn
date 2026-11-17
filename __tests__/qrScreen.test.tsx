/**
 * The QR page's save flow: the button really runs the PNG encoder and the
 * native module, reports success only after it, and turns a refusal into the
 * 去设置 second step instead of a dead end. The native module is mocked here;
 * the album itself is verified on the device (docs/features/qrcode.md §4).
 */
import React from 'react';
import {Text} from 'react-native';
import renderer from 'react-test-renderer';
import {beforeEach, describe, expect, it, jest} from '@jest/globals';

import QrCodeScreen from '../src/screens/QrCodeScreen';
import {savePngToAlbum} from '../src/native/imageSave';
import {openAlbumWritePermissionSettings} from '../src/native/permissions';
import {decodeQrFromBase64} from '../src/qr/imageDecode';

jest.mock('@react-native-oh-tpl/react-native-qrcode-svg', () => {
  const mockReact = jest.requireActual('react') as typeof import('react');
  return {
    __esModule: true,
    default: (props: object) => mockReact.createElement('QRCode', props),
  };
});

jest.mock('../src/native/imageSave', () => {
  const actual = jest.requireActual(
    '../src/native/imageSave',
  ) as typeof import('../src/native/imageSave');
  return {...actual, savePngToAlbum: jest.fn()};
});

jest.mock('../src/native/permissions', () => {
  const actual = jest.requireActual(
    '../src/native/permissions',
  ) as typeof import('../src/native/permissions');
  return {...actual, openAlbumWritePermissionSettings: jest.fn()};
});

type MockWith = {
  mockResolvedValueOnce: (value: unknown) => void;
  mockRejectedValueOnce: (error: unknown) => void;
  mockImplementation: (impl: (...args: never[]) => unknown) => void;
  mock: {calls: unknown[][]};
};

const mockSave = savePngToAlbum as unknown as MockWith;
const mockOpenSettings =
  openAlbumWritePermissionSettings as unknown as MockWith;

function flatten(children: unknown): string {
  if (Array.isArray(children)) {
    return children.map(flatten).join('');
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  return '';
}

function textOf(node: renderer.ReactTestInstance): string {
  return flatten(node.props.children);
}

function isHost(node: renderer.ReactTestInstance): boolean {
  return typeof node.type === 'string';
}

async function render(): Promise<renderer.ReactTestRenderer> {
  let tree: renderer.ReactTestRenderer | undefined;
  await renderer.act(async () => {
    tree = renderer.create(<QrCodeScreen onBack={() => {}} />);
  });
  return tree!;
}

async function press(
  tree: renderer.ReactTestRenderer,
  testID: string,
): Promise<void> {
  const props = tree.root
    .findAllByProps({testID})
    .map(node => node.props)
    .find(value => typeof value.onPress === 'function');
  if (props === undefined) {
    throw new Error(`no pressable with testID ${testID}`);
  }
  await renderer.act(async () => {
    props.onPress();
  });
}

/** The text of a testID, skipping composite nodes whose children are elements. */
function textAt(tree: renderer.ReactTestRenderer, testID: string): string {
  for (const node of tree.root.findAllByProps({testID})) {
    if (!isHost(node)) {
      continue;
    }
    const text = textOf(node);
    if (text.length > 0) {
      return text;
    }
  }
  return '';
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockImplementation(() =>
    Promise.resolve({
      saved: true,
      uri: 'file://media/Photo/1/IMG_1/KMP-RN-QR.png',
      title: 'KMP-RN-QR-20261117-180300',
    }),
  );
  mockOpenSettings.mockImplementation(() => Promise.resolve(undefined));
});

describe('QrCodeScreen save to album', () => {
  it('offers the save button with the live hint, not the old unavailable text', async () => {
    const tree = await render();

    expect(textAt(tree, 'qr-save-label')).toBe('保存到相册');
    expect(textAt(tree, 'qr-save-result')).toBe('保存为 PNG 并写入系统相册');
    expect(
      tree.root.findAllByProps({testID: 'qr-save-settings'}).filter(isHost),
    ).toHaveLength(0);

    renderer.act(() => tree.unmount());
  });

  it('encodes the live matrix to a scannable PNG and reports the save', async () => {
    const tree = await render();

    await press(tree, 'qr-save');

    expect(mockSave).toHaveBeenCalledTimes(1);
    const [base64, title] = mockSave.mock.calls[0] as [string, string];
    expect(decodeQrFromBase64(base64)).toEqual({
      ok: true,
      value: 'https://example.com',
    });
    expect(title).toMatch(/^KMP-RN-QR-\d{8}-\d{6}$/);
    expect(textAt(tree, 'qr-save-result')).toBe('已保存到相册');

    renderer.act(() => tree.unmount());
  });

  it('shows the denial advice and a working 去设置 instead of a dead end', async () => {
    mockSave.mockImplementation(() =>
      Promise.resolve({
        saved: false,
        permissionDenied: true,
        reason: '相册写入权限被拒绝（WRITE_IMAGEVIDEO）',
      }),
    );
    const tree = await render();

    await press(tree, 'qr-save');

    const hint = textAt(tree, 'qr-save-result');
    expect(hint).toContain('被拒绝了');
    expect(hint).toContain('去设置');
    expect(
      tree.root.findAllByProps({testID: 'qr-save-settings'}).filter(isHost),
    ).toHaveLength(1);

    await press(tree, 'qr-save-settings');
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(textAt(tree, 'qr-save-result')).toBe(
      '已打开系统设置页；回到 App 后重新点「保存到相册」',
    );

    renderer.act(() => tree.unmount());
  });

  it('prints the platform reason when the write itself fails', async () => {
    mockSave.mockImplementation(() =>
      Promise.resolve({
        saved: false,
        permissionDenied: false,
        reason: '写入相册失败：13900020 Invalid argument',
      }),
    );
    const tree = await render();

    await press(tree, 'qr-save');

    expect(textAt(tree, 'qr-save-result')).toBe(
      '保存失败：写入相册失败：13900020 Invalid argument',
    );
    expect(
      tree.root.findAllByProps({testID: 'qr-save-settings'}).filter(isHost),
    ).toHaveLength(0);

    renderer.act(() => tree.unmount());
  });

  it('explains a missing module instead of pretending the save happened', async () => {
    mockSave.mockImplementation(() =>
      Promise.reject(new Error('ImageSave 模块没有注册')),
    );
    const tree = await render();

    await press(tree, 'qr-save');

    expect(textAt(tree, 'qr-save-result')).toContain('ImageSave 模块没有注册');

    renderer.act(() => tree.unmount());
  });

  it('disables the button while there is no code to save', async () => {
    const tree = await render();

    await renderer.act(async () => {
      tree.root.findByProps({testID: 'qr-input'}).props.onChangeText('');
    });

    const button = tree.root
      .findAllByProps({testID: 'qr-save'})
      .map(node => node.props)
      .find(value => typeof value.onPress === 'function');
    if (button === undefined) {
      throw new Error('qr-save is not pressable');
    }
    expect(button.accessibilityState.disabled).toBe(true);
    await renderer.act(async () => {
      button.onPress();
    });
    expect(mockSave).not.toHaveBeenCalled();

    renderer.act(() => tree.unmount());
  });
});

describe('QrCodeScreen text', () => {
  it('keeps the live version label while the save section changed', async () => {
    const tree = await render();

    expect(textAt(tree, 'qr-meta')).toMatch(
      /^版本 \d+ · \d+×\d+ 模块 \+ 4 模块静区$/,
    );
    expect(textOf(tree.root.findAllByType(Text)[0])).toBe('返回');

    renderer.act(() => tree.unmount());
  });
});

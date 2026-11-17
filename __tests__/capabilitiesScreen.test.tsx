/**
 * The capability page's contract with the ticket: all 14 KMP rows in the KMP
 * order, an honest status per row, no action button on an unimplemented row,
 * and the two implemented rows calling the real picker/decoder wrappers and
 * printing their answer inside the row.
 *
 * The native modules are replaced here, as in `scanScreen.test.tsx`; the device
 * run is what proves the platform side.
 */
import React from 'react';
import {Text} from 'react-native';
import renderer from 'react-test-renderer';
import {beforeEach, expect, it, jest} from '@jest/globals';

import {CAPABILITIES, UNIMPLEMENTED_NOTE} from '../src/data/capabilities';
import CapabilitiesScreen from '../src/screens/CapabilitiesScreen';
import {getItem, removeItem, setItem} from '../src/native/asyncStorage';
import {
  getString as readClipboard,
  setString as writeClipboard,
} from '../src/native/clipboard';
import {readDeviceInfo} from '../src/native/deviceInfo';
import {launchImageLibrary} from '../src/native/imagePicker';
import {decodeImage, isNativeScanAvailable} from '../src/native/scanKit';
import {openExternalUrl} from '../src/native/urlOpener';

jest.mock('../src/native/imagePicker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('../src/native/deviceInfo', () => ({
  readDeviceInfo: jest.fn(),
}));

jest.mock('../src/native/asyncStorage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../src/native/clipboard', () => ({
  getString: jest.fn(),
  setString: jest.fn(),
}));

jest.mock('../src/native/scanKit', () => ({
  isNativeScanAvailable: jest.fn(() => false),
  decodeImage: jest.fn(),
}));

jest.mock('../src/native/urlOpener', () => ({
  DEMO_URL: 'https://example.com',
  openExternalUrl: jest.fn(),
}));

type MockWith = {
  mockImplementation: (impl: (...args: never[]) => unknown) => void;
  mockResolvedValue: (value: unknown) => void;
  mockResolvedValueOnce: (value: unknown) => void;
  mockReturnValue: (value: unknown) => void;
  mock: {calls: unknown[][]};
};

const mockLaunch = launchImageLibrary as unknown as MockWith;
const mockDeviceInfo = readDeviceInfo as unknown as MockWith;
const mockNativeAvailable = isNativeScanAvailable as unknown as MockWith;
const mockDecodeImage = decodeImage as unknown as MockWith;
const mockOpenUrl = openExternalUrl as unknown as MockWith;
const mockGetItem = getItem as unknown as MockWith;
const mockSetItem = setItem as unknown as MockWith;
const mockRemoveItem = removeItem as unknown as MockWith;
const mockClipboardGet = readClipboard as unknown as MockWith;
const mockClipboardSet = writeClipboard as unknown as MockWith;

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

/**
 * `findAll` also matches the composite `View`/`Text` that produced a host node,
 * so a testID lookup without this filter sees every node twice.
 */
function isHost(node: renderer.ReactTestInstance): boolean {
  return typeof node.type === 'string';
}

function render(onBack: () => void = () => {}): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | undefined;
  renderer.act(() => {
    tree = renderer.create(<CapabilitiesScreen onBack={onBack} />);
  });
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLaunch.mockImplementation(() => Promise.resolve({didCancel: true}));
  mockDeviceInfo.mockImplementation(() =>
    Promise.resolve({
      model: 'ALN-AL00',
      systemName: 'HarmonyOS',
      systemVersion: '7.0.0.111(SP10C00E111R4P3)',
      appName: 'KMP RN Demo',
      appVersion: '1.0.0',
    }),
  );
  mockNativeAvailable.mockReturnValue(false);
  mockDecodeImage.mockImplementation(() =>
    Promise.reject(new Error('decodeImage should not run here')),
  );
  mockOpenUrl.mockImplementation(() =>
    Promise.resolve({ok: true, url: 'https://example.com'}),
  );
  mockGetItem.mockImplementation(() => Promise.resolve(null));
  mockSetItem.mockImplementation(() => Promise.resolve(undefined));
  mockRemoveItem.mockImplementation(() => Promise.resolve(undefined));
  mockClipboardSet.mockImplementation(() => undefined);
  mockClipboardGet.mockImplementation(() => Promise.resolve(''));
});

it('renders the 14 KMP capabilities in the KMP page order', () => {
  const tree = render();
  const rows = tree.root.findAll(
    node =>
      isHost(node) &&
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith('capability-row-'),
  );

  expect(rows).toHaveLength(14);
  expect(rows.map(row => row.props.testID)).toEqual(
    CAPABILITIES.map(capability => `capability-row-${capability.id}`),
  );
  expect(textOf(tree.root.findByProps({testID: 'capabilities-count'}))).toBe(
    '共 14 项',
  );

  // The KMP page draws 存储目录 second (its enum value is last), and the
  // acceptance check compares the two pages side by side.
  expect(CAPABILITIES[0].title).toBe('本地存储');
  expect(CAPABILITIES[1].title).toBe('存储目录');
  expect(CAPABILITIES[13].title).toBe('图片解析二维码');

  const titles = tree.root
    .findAllByType(Text)
    .map(textOf)
    .filter(value =>
      CAPABILITIES.some(capability => capability.title === value),
    );
  expect(titles).toEqual(CAPABILITIES.map(capability => capability.title));

  renderer.act(() => {
    tree.unmount();
  });
});

it('gives every implemented row a button, and no button to the rest', () => {
  const tree = render();

  for (const capability of CAPABILITIES) {
    const status = textOf(
      tree.root.findByProps({testID: `capability-status-${capability.id}`}),
    );
    const buttons = tree.root
      .findAllByProps({testID: `capability-action-${capability.id}`})
      .filter(isHost);
    const notes = tree.root
      .findAllByProps({testID: `capability-note-${capability.id}`})
      .filter(isHost);
    const limitations = tree.root
      .findAllByProps({testID: `capability-limitation-${capability.id}`})
      .filter(isHost);

    if (capability.status === 'unimplemented') {
      expect(status).toBe('未实现');
      // No button that could be pressed and do nothing.
      expect(buttons).toHaveLength(0);
      expect(notes).toHaveLength(1);
      expect(textOf(notes[0])).toBe(UNIMPLEMENTED_NOTE);
    } else {
      expect(status).toBe(
        capability.status === 'available' ? '可用' : '部分可用',
      );
      expect(buttons).toHaveLength(1);
      expect(notes).toHaveLength(0);
    }

    if (capability.status === 'limited') {
      expect(limitations).toHaveLength(1);
      expect(textOf(limitations[0])).toContain('PasteButton');
    } else {
      expect(limitations).toHaveLength(0);
    }
  }

  expect(
    CAPABILITIES.filter(capability => capability.status === 'available').map(
      capability => capability.id,
    ),
  ).toEqual([
    'local-storage',
    'device-info',
    'url-opener',
    'image-pick',
    'barcode-decode',
  ]);
  expect(
    CAPABILITIES.filter(capability => capability.status === 'limited').map(
      capability => capability.id,
    ),
  ).toEqual(['clipboard']);

  renderer.act(() => {
    tree.unmount();
  });
});

it('prints the real device model, system version and app build for 设备信息', async () => {
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-device-info'})
      .props.onPress();
  });

  expect(mockDeviceInfo).toHaveBeenCalledTimes(1);
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-device-info'})),
  ).toBe('ALN-AL00 · HarmonyOS 7.0.0.111(SP10C00E111R4P3) · KMP RN Demo 1.0.0');

  renderer.act(() => {
    tree.unmount();
  });
});

it('writes the clipboard and reports a refused read-back as the platform limit', async () => {
  mockClipboardGet.mockImplementation(() =>
    Promise.reject(new Error('User refuses authorization')),
  );
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-clipboard'})
      .props.onPress();
  });

  expect(mockClipboardSet).toHaveBeenCalledTimes(1);
  const written = mockClipboardSet.mock.calls[0][0] as string;
  expect(written).toMatch(/^RN 剪贴板演示 \d{4}$/);
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-clipboard'})),
  ).toBe(
    `写入「${written}」成功；读回失败：User refuses authorization（读取需要系统 PasteButton 安全控件授权）`,
  );

  renderer.act(() => {
    tree.unmount();
  });
});

it('reads the clipboard back when the platform allows it', async () => {
  mockClipboardGet.mockImplementation(() =>
    Promise.resolve('RN 剪贴板演示 1234'),
  );
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-clipboard'})
      .props.onPress();
  });

  const written = mockClipboardSet.mock.calls[0][0] as string;
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-clipboard'})),
  ).toBe(`写入「${written}」→ 读回「RN 剪贴板演示 1234」`);

  renderer.act(() => {
    tree.unmount();
  });
});

it('calls the system picker for 从相册选图 and prints the picked file', async () => {
  mockLaunch.mockImplementation(() =>
    Promise.resolve({
      assets: [
        {
          fileName: 'screenshot.png',
          type: 'image/png',
          fileSize: 4096,
          uri: 'file://media/Photo/1/IMG_1.png',
        },
      ],
    }),
  );
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-image-pick'})
      .props.onPress();
  });

  expect(mockLaunch).toHaveBeenCalledTimes(1);
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-image-pick'})),
  ).toBe('已选择：screenshot.png · image/png · 4096 字节');

  renderer.act(() => {
    tree.unmount();
  });
});

it('decodes a picked image through Scan Kit for 图片解析二维码', async () => {
  mockNativeAvailable.mockReturnValue(true);
  mockLaunch.mockImplementation(() =>
    Promise.resolve({
      assets: [{uri: 'file://media/Photo/2/IMG_2.jpg', type: 'image/jpeg'}],
    }),
  );
  mockDecodeImage.mockImplementation(() =>
    Promise.resolve({ok: true, values: ['https://example.com']}),
  );
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-barcode-decode'})
      .props.onPress();
  });

  expect(mockDecodeImage).toHaveBeenCalledWith(
    'file://media/Photo/2/IMG_2.jpg',
  );
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-barcode-decode'})),
  ).toBe('解析到 1 个：https://example.com');

  renderer.act(() => {
    tree.unmount();
  });
});

it('reports a picker cancel without `didCancel` as 已取消选图', async () => {
  // HarmonyOS returns an empty result when the picker is dismissed with back.
  mockLaunch.mockImplementation(() => Promise.resolve({assets: []}));
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-image-pick'})
      .props.onPress();
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-image-pick'})),
  ).toBe('已取消选图');

  renderer.act(() => {
    tree.unmount();
  });
});

it('reports a missing image-picker module instead of a silent no-op', async () => {
  mockLaunch.mockImplementation(() =>
    Promise.reject(
      new Error('ImagePicker 模块没有注册（launchImageLibrary 不存在）'),
    ),
  );
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-image-pick'})
      .props.onPress();
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-image-pick'})),
  ).toBe('失败：ImagePicker 模块没有注册（launchImageLibrary 不存在）');

  renderer.act(() => {
    tree.unmount();
  });
});

it('runs 写 → 读 → 删 → 再读 through AsyncStorage and prints the round trip', async () => {
  mockSetItem.mockImplementation((...args: never[]) => {
    const value = args[1];
    mockGetItem.mockResolvedValueOnce(value);
    return Promise.resolve(undefined);
  });
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-local-storage'})
      .props.onPress();
  });

  expect(mockSetItem).toHaveBeenCalledTimes(1);
  const [key, value] = mockSetItem.mock.calls[0] as [string, string];
  expect(key).toBe('platform_capabilities.demo_key');
  expect(value).toMatch(/^rn-demo-\d{4}$/);
  expect(mockGetItem).toHaveBeenCalledWith(key);
  expect(mockRemoveItem).toHaveBeenCalledWith(key);
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-local-storage'})),
  ).toBe(`写入「${value}」→ 读回「${value}」→ 删除 → 再读「null」`);

  renderer.act(() => {
    tree.unmount();
  });
});

it('reports an AsyncStorage failure instead of a fake round trip', async () => {
  mockSetItem.mockImplementation(() =>
    Promise.reject(new Error('AsyncStorage 模块没有注册')),
  );
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-local-storage'})
      .props.onPress();
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-local-storage'})),
  ).toBe('失败：AsyncStorage 模块没有注册');

  renderer.act(() => {
    tree.unmount();
  });
});

it('prints the browser hand-off for 打开链接', async () => {
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-url-opener'})
      .props.onPress();
  });

  expect(mockOpenUrl).toHaveBeenCalledWith('https://example.com');
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-url-opener'})),
  ).toBe('已交给系统浏览器：https://example.com');

  renderer.act(() => {
    tree.unmount();
  });
});

it('shows the guard reason when a URL is refused', async () => {
  mockOpenUrl.mockImplementation(() =>
    Promise.resolve({
      ok: false,
      reason: '只允许打开 http/https 链接：tuitui://demo',
    }),
  );
  const tree = render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-url-opener'})
      .props.onPress();
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-url-opener'})),
  ).toBe('只允许打开 http/https 链接：tuitui://demo');

  renderer.act(() => {
    tree.unmount();
  });
});

it('goes back to the list', () => {
  const onBack = jest.fn();
  const tree = render(onBack);

  renderer.act(() => {
    tree.root.findByProps({testID: 'capabilities-back'}).props.onPress();
  });

  expect(onBack).toHaveBeenCalledTimes(1);

  renderer.act(() => {
    tree.unmount();
  });
});

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
import {vibrate} from '../src/native/haptics';
import {launchImageLibrary} from '../src/native/imagePicker';
import {savePngToAlbum} from '../src/native/imageSave';
import {readNetworkStatus} from '../src/native/networkStatus';
import {
  openAlbumWritePermissionSettings,
  openPermissionSettings,
  PERMISSIONS,
  readPermissionState,
  requestPermission,
} from '../src/native/permissions';
import {readDirectories} from '../src/native/storageDirectories';
import {SHARE_DEMO_TEXT, shareText} from '../src/native/systemShare';
import {decodeImage, isNativeScanAvailable} from '../src/native/scanKit';
import {openExternalUrl} from '../src/native/urlOpener';
import {decodeQrFromBase64} from '../src/qr/imageDecode';

jest.mock('../src/native/imagePicker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('../src/native/imageSave', () => {
  const actual = jest.requireActual(
    '../src/native/imageSave',
  ) as typeof import('../src/native/imageSave');
  return {...actual, savePngToAlbum: jest.fn()};
});

jest.mock('../src/native/deviceInfo', () => ({
  readDeviceInfo: jest.fn(),
}));

jest.mock('../src/native/haptics', () => ({
  vibrate: jest.fn(),
}));

jest.mock('../src/native/systemShare', () => {
  const actual = jest.requireActual(
    '../src/native/systemShare',
  ) as typeof import('../src/native/systemShare');
  return {...actual, shareText: jest.fn()};
});

jest.mock('../src/native/permissions', () => {
  const actual = jest.requireActual(
    '../src/native/permissions',
  ) as typeof import('../src/native/permissions');
  return {
    ...actual,
    openAlbumWritePermissionSettings: jest.fn(),
    openPermissionSettings: jest.fn(),
    readPermissionState: jest.fn(),
    requestPermission: jest.fn(),
  };
});

jest.mock('../src/native/networkStatus', () => ({
  readNetworkStatus: jest.fn(),
}));

jest.mock('../src/native/storageDirectories', () => ({
  readDirectories: jest.fn(),
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
  mockImplementationOnce: (impl: (...args: never[]) => unknown) => MockWith;
  mockReturnValue: (value: unknown) => void;
  mock: {calls: unknown[][]};
};

const mockLaunch = launchImageLibrary as unknown as MockWith;
const mockSavePng = savePngToAlbum as unknown as MockWith;
const mockDeviceInfo = readDeviceInfo as unknown as MockWith;
const mockNetworkStatus = readNetworkStatus as unknown as MockWith;
const mockReadDirectories = readDirectories as unknown as MockWith;
const mockNativeAvailable = isNativeScanAvailable as unknown as MockWith;
const mockDecodeImage = decodeImage as unknown as MockWith;
const mockOpenUrl = openExternalUrl as unknown as MockWith;
const mockVibrate = vibrate as unknown as MockWith;
const mockShareText = shareText as unknown as MockWith;
const mockReadPermissionState = readPermissionState as unknown as MockWith;
const mockRequestPermission = requestPermission as unknown as MockWith;
const mockOpenPermissionSettings =
  openPermissionSettings as unknown as MockWith;
const mockOpenAlbumWriteSettings =
  openAlbumWritePermissionSettings as unknown as MockWith;
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

async function render(
  onBack: () => void = () => {},
): Promise<renderer.ReactTestRenderer> {
  let tree: renderer.ReactTestRenderer | undefined;
  // Async act flushes the directory card's first read, which runs in an effect.
  await renderer.act(async () => {
    tree = renderer.create(<CapabilitiesScreen onBack={onBack} />);
  });
  return tree!;
}

/** The seven rows the HarmonyOS card gets, in the KMP order. */
const DIRECTORY_ROWS = [
  {
    kind: 'Cache',
    path: '/data/storage/el2/base/haps/entry/cache',
    exists: true,
  },
  {
    kind: 'Files',
    path: '/data/storage/el2/base/haps/entry/files',
    exists: true,
  },
  {
    kind: 'Database',
    path: '/data/storage/el2/database/entry',
    exists: true,
  },
  {
    kind: 'Temp',
    path: '/data/storage/el2/base/haps/entry/temp',
    exists: true,
  },
  {
    kind: 'Downloads',
    path: undefined,
    exists: false,
    note: '当前设备类型不支持公共下载目录（801：仅 PC/2in1 与平板支持）',
  },
  {
    kind: 'Documents',
    path: undefined,
    exists: false,
    note: '当前设备类型不支持公共文档目录（801：仅 PC/2in1 与平板支持）',
  },
  {
    kind: 'PhotoAlbum',
    path: undefined,
    exists: false,
    note: '鸿蒙相册通过 photoAccessHelper 的 URI 访问（如 file://media/Photo/...），没有可直接使用的目录路径',
  },
];

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
  mockNetworkStatus.mockImplementation(() =>
    Promise.resolve({connected: true, type: 'wifi'}),
  );
  mockReadDirectories.mockImplementation(() => Promise.resolve(DIRECTORY_ROWS));
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
  mockVibrate.mockImplementation(() => Promise.resolve({fired: true}));
  mockShareText.mockImplementation(() => Promise.resolve(undefined));
  mockReadPermissionState.mockImplementation(() =>
    Promise.resolve('notDetermined'),
  );
  mockRequestPermission.mockImplementation(() => Promise.resolve('granted'));
  mockOpenPermissionSettings.mockImplementation(() =>
    Promise.resolve(undefined),
  );
  mockOpenAlbumWriteSettings.mockImplementation(() =>
    Promise.resolve(undefined),
  );
  mockSavePng.mockImplementation(() =>
    Promise.resolve({
      saved: true,
      uri: 'file://media/Photo/1/IMG_1/KMP-RN-QR.png',
      title: 'KMP-RN-QR-20261117-180300',
    }),
  );
});

it('renders the 14 KMP capabilities in the KMP page order', async () => {
  const tree = await render();
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
    )
    // 保存图片到相册 is both the row title and its button label, so keep the
    // first occurrence per title when checking the row order.
    .filter((value, index, all) => all.indexOf(value) === index);
  expect(titles).toEqual(CAPABILITIES.map(capability => capability.title));

  renderer.act(() => {
    tree.unmount();
  });
});

it('gives every implemented row a button, and no button to the rest', async () => {
  const tree = await render();

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

    if (capability.id === 'directories') {
      expect(status).toBe('可用');
      // The directory card has a 刷新 button and one 复制 per row, not a single
      // capability action button.
      expect(buttons).toHaveLength(0);
      expect(notes).toHaveLength(0);
      expect(
        tree.root
          .findAllByProps({testID: 'capability-directories-refresh'})
          .filter(isHost),
      ).toHaveLength(1);
      continue;
    }

    if (capability.id === 'haptics') {
      expect(status).toBe('可用');
      // Three strength buttons in a row, and no separate query button.
      expect(buttons).toHaveLength(0);
      expect(notes).toHaveLength(0);
      for (const strength of ['light', 'medium', 'heavy']) {
        expect(
          tree.root
            .findAllByProps({testID: `capability-haptic-${strength}`})
            .filter(isHost),
        ).toHaveLength(1);
      }
      continue;
    }

    if (capability.id === 'camera-permission') {
      expect(status).toBe('可用');
      // The permission card draws its own 查询 / 申请 / 去设置 per row.
      expect(buttons).toHaveLength(0);
      expect(notes).toHaveLength(0);
      expect(
        tree.root
          .findAllByProps({testID: 'capability-permission-note'})
          .filter(isHost),
      ).toHaveLength(1);
      continue;
    }

    if (capability.id === 'bluetooth-le') {
      expect(status).toBe('可用');
      // The Bluetooth card draws 扫描 plus one 连接 per scanned device; it has
      // no single capability action button.
      expect(buttons).toHaveLength(0);
      expect(notes).toHaveLength(0);
      expect(
        tree.root
          .findAllByProps({testID: 'capability-bluetooth-scan'})
          .filter(isHost),
      ).toHaveLength(1);
      continue;
    }

    if (capability.id === 'wifi-network') {
      expect(status).toBe('可用');
      // The WiFi card draws 扫描 / 当前 SSID plus one 连接 per seen AP; it has
      // no single capability action button.
      expect(buttons).toHaveLength(0);
      expect(notes).toHaveLength(0);
      expect(
        tree.root
          .findAllByProps({testID: 'capability-wifi-scan'})
          .filter(isHost),
      ).toHaveLength(1);
      expect(
        tree.root
          .findAllByProps({testID: 'capability-wifi-current'})
          .filter(isHost),
      ).toHaveLength(1);
      continue;
    }

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
    'directories',
    'device-info',
    'network-status',
    'haptics',
    'system-share',
    'url-opener',
    'camera-permission',
    'bluetooth-le',
    'wifi-network',
    'image-save',
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
  const tree = await render();

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

it('prints the live network twice: wifi, then none after Wi-Fi is off', async () => {
  mockNetworkStatus
    .mockImplementationOnce(() =>
      Promise.resolve({connected: true, type: 'wifi'}),
    )
    .mockImplementationOnce(() =>
      Promise.resolve({connected: false, type: 'none'}),
    );
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-network-status'})
      .props.onPress();
  });
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-network-status'})),
  ).toBe('已联网 · wifi');

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-network-status'})
      .props.onPress();
  });
  expect(mockNetworkStatus).toHaveBeenCalledTimes(2);
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-network-status'})),
  ).toBe('未联网 · none');

  renderer.act(() => {
    tree.unmount();
  });
});

it('prints an unrecognised network transport as 未知', async () => {
  mockNetworkStatus.mockImplementation(() =>
    Promise.resolve({connected: true, type: 'unknown'}),
  );
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-network-status'})
      .props.onPress();
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-network-status'})),
  ).toBe('已联网 · 未知');

  renderer.act(() => {
    tree.unmount();
  });
});

it('lists all seven directories with real paths, existence and notes', async () => {
  const tree = await render();

  expect(
    textOf(tree.root.findByProps({testID: 'capability-directories-count'})),
  ).toBe('共 7 项');

  for (const row of DIRECTORY_ROWS) {
    expect(
      tree.root
        .findAllByProps({testID: `capability-directory-row-${row.kind}`})
        .filter(isHost),
    ).toHaveLength(1);
  }

  expect(
    textOf(tree.root.findByProps({testID: 'capability-directory-path-Cache'})),
  ).toBe('/data/storage/el2/base/haps/entry/cache');
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-directory-exists-Cache'}),
    ),
  ).toBe('存在');
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-directory-path-Downloads'}),
    ),
  ).toContain('801：仅 PC/2in1 与平板支持');
  // No invented path and no copy button on a row without one.
  expect(
    tree.root
      .findAllByProps({testID: 'capability-directory-copy-Downloads'})
      .filter(isHost),
  ).toHaveLength(0);
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-directory-path-PhotoAlbum'}),
    ),
  ).toContain('photoAccessHelper');

  renderer.act(() => {
    tree.unmount();
  });
});

it('reads without a permission request, and 刷新 asks for the permission', async () => {
  const tree = await render();

  // Opening the page must not show a dialog.
  expect(mockReadDirectories).toHaveBeenNthCalledWith(1, false);

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-directories-refresh'})
      .props.onPress();
  });

  expect(mockReadDirectories).toHaveBeenNthCalledWith(2, true);

  renderer.act(() => {
    tree.unmount();
  });
});

it('copies a directory path and shows 已复制', async () => {
  const tree = await render();

  renderer.act(() => {
    tree.root
      .findByProps({testID: 'capability-directory-copy-Cache'})
      .props.onPress();
  });

  expect(mockClipboardSet).toHaveBeenCalledWith(
    '/data/storage/el2/base/haps/entry/cache',
  );
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-directory-copied-Cache'}),
    ),
  ).toBe('已复制');

  renderer.act(() => {
    tree.unmount();
  });
});

it('writes the clipboard and reports a refused read-back as the platform limit', async () => {
  mockClipboardGet.mockImplementation(() =>
    Promise.reject(new Error('User refuses authorization')),
  );
  const tree = await render();

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
  const tree = await render();

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

it('saves a scannable QR PNG to the album from 保存图片到相册', async () => {
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-image-save'})
      .props.onPress();
  });

  expect(mockSavePng).toHaveBeenCalledTimes(1);
  const [base64, title] = mockSavePng.mock.calls[0] as [string, string];
  expect(decodeQrFromBase64(base64)).toEqual({
    ok: true,
    value: 'https://example.com',
  });
  expect(title).toMatch(/^KMP-RN-QR-\d{8}-\d{6}$/);
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-image-save'})),
  ).toBe('已保存到相册（KMP-RN-QR-20261117-180300）');

  renderer.act(() => {
    tree.unmount();
  });
});

it('offers 去设置 when the album write permission is refused', async () => {
  mockSavePng.mockImplementation(() =>
    Promise.resolve({
      saved: false,
      permissionDenied: true,
      reason: '相册写入权限被拒绝（WRITE_IMAGEVIDEO）',
    }),
  );
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-image-save'})
      .props.onPress();
  });

  const result = textOf(
    tree.root.findByProps({testID: 'capability-result-image-save'}),
  );
  expect(result).toContain('被拒绝了');
  expect(result).toContain('去设置');
  expect(
    tree.root
      .findAllByProps({testID: 'capability-settings-image-save'})
      .filter(isHost),
  ).toHaveLength(1);

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-settings-image-save'})
      .props.onPress();
  });
  expect(mockOpenAlbumWriteSettings).toHaveBeenCalledTimes(1);
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-image-save'})),
  ).toBe('已打开系统设置页；回到 App 后重新点「保存图片到相册」');

  renderer.act(() => {
    tree.unmount();
  });
});

it('prints the platform reason when the album write itself fails', async () => {
  mockSavePng.mockImplementation(() =>
    Promise.resolve({
      saved: false,
      permissionDenied: false,
      reason: '写入相册失败：13900020 Invalid argument',
    }),
  );
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-image-save'})
      .props.onPress();
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-image-save'})),
  ).toBe('保存失败：写入相册失败：13900020 Invalid argument');
  expect(
    tree.root
      .findAllByProps({testID: 'capability-settings-image-save'})
      .filter(isHost),
  ).toHaveLength(0);

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
  const tree = await render();

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
  const tree = await render();

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
  const tree = await render();

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
  const tree = await render();

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
  const tree = await render();

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
  const tree = await render();

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
  const tree = await render();

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
  const tree = await render();

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

it('offers the three haptic strengths and prints the fallback note', async () => {
  mockVibrate.mockImplementation(() =>
    Promise.resolve({
      fired: true,
      note: '物理反馈被系统触感开关忽略，已用通知场景振动代替',
    }),
  );
  const tree = await render();

  // Nothing happens until a strength is pressed: no separate query button.
  expect(mockVibrate).not.toHaveBeenCalled();

  await renderer.act(async () => {
    tree.root.findByProps({testID: 'capability-haptic-light'}).props.onPress();
  });

  expect(mockVibrate).toHaveBeenCalledWith('light');
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-haptics'})),
  ).toBe('已触发轻震动（物理反馈被系统触感开关忽略，已用通知场景振动代替）');

  await renderer.act(async () => {
    tree.root.findByProps({testID: 'capability-haptic-heavy'}).props.onPress();
  });
  expect(mockVibrate).toHaveBeenLastCalledWith('heavy');
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-haptics'})),
  ).toContain('已触发重震动');

  renderer.act(() => {
    tree.unmount();
  });
});

it('explains why a haptic tap failed instead of showing a silent no-op', async () => {
  mockVibrate.mockImplementation(() =>
    Promise.reject(new Error('该设备没有振动马达，无法触发震动')),
  );
  const tree = await render();

  await renderer.act(async () => {
    tree.root.findByProps({testID: 'capability-haptic-medium'}).props.onPress();
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-haptics'})),
  ).toBe('失败：该设备没有振动马达，无法触发震动');

  renderer.act(() => {
    tree.unmount();
  });
});

it('opens the system share panel for 系统分享', async () => {
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-system-share'})
      .props.onPress();
  });

  expect(mockShareText).toHaveBeenCalledWith(SHARE_DEMO_TEXT);
  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-system-share'})),
  ).toBe(`已拉起系统分享面板（内容：${SHARE_DEMO_TEXT}）`);

  renderer.act(() => {
    tree.unmount();
  });
});

it('prints a share failure instead of claiming the panel opened', async () => {
  mockShareText.mockImplementation(() =>
    Promise.reject(
      new Error(
        '当前设备不支持系统分享（SystemCapability.Collaboration.SystemShare 不可用）',
      ),
    ),
  );
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-action-system-share'})
      .props.onPress();
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-result-system-share'})),
  ).toContain('当前设备不支持系统分享');

  renderer.act(() => {
    tree.unmount();
  });
});

it('lists the eight permissions with the platform note and ACL rows', async () => {
  const tree = await render();

  expect(
    textOf(tree.root.findByProps({testID: 'capability-permission-note'})),
  ).toContain('鸿蒙没有「永久拒绝」状态');
  expect(
    textOf(tree.root.findByProps({testID: 'capability-permission-note'})),
  ).toContain('system_basic');

  const rows = tree.root.findAll(
    node =>
      isHost(node) &&
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith('capability-permission-') &&
      !node.props.testID.startsWith('capability-permission-state-') &&
      !node.props.testID.startsWith('capability-permission-query-') &&
      !node.props.testID.startsWith('capability-permission-request-') &&
      !node.props.testID.startsWith('capability-permission-settings-') &&
      !node.props.testID.startsWith('capability-permission-advice-') &&
      !node.props.testID.startsWith('capability-permission-result-') &&
      !node.props.testID.startsWith('capability-permission-unavailable-') &&
      node.props.testID !== 'capability-permission-note',
  );
  expect(rows.map(row => row.props.testID)).toEqual(
    PERMISSIONS.map(permission => `capability-permission-${permission.id}`),
  );

  for (const permission of PERMISSIONS) {
    if (permission.unavailableReason !== undefined) {
      continue;
    }
    expect(
      textOf(
        tree.root.findByProps({
          testID: `capability-permission-state-${permission.id}`,
        }),
      ),
    ).toBe('未查询');
  }

  // The ACL rows explain themselves and offer no button that cannot work.
  for (const id of ['photo_library', 'contacts']) {
    expect(
      textOf(
        tree.root.findByProps({
          testID: `capability-permission-unavailable-${id}`,
        }),
      ),
    ).toContain('ACL 受限权限');
    expect(
      tree.root
        .findAllByProps({testID: `capability-permission-query-${id}`})
        .filter(isHost),
    ).toHaveLength(0);
    expect(
      tree.root
        .findAllByProps({testID: `capability-permission-request-${id}`})
        .filter(isHost),
    ).toHaveLength(0);
  }

  renderer.act(() => {
    tree.unmount();
  });
});

it('queries one permission and shows the real state', async () => {
  mockReadPermissionState.mockImplementation(() => Promise.resolve('granted'));
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-permission-query-camera'})
      .props.onPress();
  });

  expect(mockReadPermissionState).toHaveBeenCalledWith('camera');
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-permission-state-camera'}),
    ),
  ).toBe('已授权');
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-permission-advice-camera'}),
    ),
  ).toBe('已授权，可以直接使用');

  renderer.act(() => {
    tree.unmount();
  });
});

it('turns a denied permission into a 去设置 row instead of a dead end', async () => {
  mockRequestPermission.mockImplementation(() => Promise.resolve('denied'));
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-permission-request-camera'})
      .props.onPress();
  });

  expect(mockRequestPermission).toHaveBeenCalledWith('camera');
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-permission-state-camera'}),
    ),
  ).toBe('已拒绝');
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-permission-advice-camera'}),
    ),
  ).toContain('去设置');

  const settings = tree.root.findAllByProps({
    testID: 'capability-permission-settings-camera',
  });
  expect(settings.length).toBeGreaterThan(0);
  expect(
    tree.root
      .findAllByProps({testID: 'capability-permission-settings-camera'})
      .filter(isHost),
  ).toHaveLength(1);

  await renderer.act(async () => {
    settings[0].props.onPress();
  });

  expect(mockOpenPermissionSettings).toHaveBeenCalledWith('camera');
  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-permission-result-camera'}),
    ),
  ).toBe('已打开系统设置页；回到 App 后点「查询」刷新状态');

  renderer.act(() => {
    tree.unmount();
  });
});

it('reports a permission request failure with the platform reason', async () => {
  mockRequestPermission.mockImplementation(() =>
    Promise.reject(
      new Error('权限申请返回了 2（权限是否已在 module.json5 声明？）'),
    ),
  );
  const tree = await render();

  await renderer.act(async () => {
    tree.root
      .findByProps({testID: 'capability-permission-request-calendar'})
      .props.onPress();
  });

  expect(
    textOf(
      tree.root.findByProps({testID: 'capability-permission-result-calendar'}),
    ),
  ).toBe('申请失败：权限申请返回了 2（权限是否已在 module.json5 声明？）');

  renderer.act(() => {
    tree.unmount();
  });
});

it('goes back to the list', async () => {
  const onBack = jest.fn();
  const tree = await render(onBack);

  renderer.act(() => {
    tree.root.findByProps({testID: 'capabilities-back'}).props.onPress();
  });

  expect(onBack).toHaveBeenCalledTimes(1);

  renderer.act(() => {
    tree.unmount();
  });
});

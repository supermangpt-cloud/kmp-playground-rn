/**
 * The 蓝牙 LE card's behaviour on the capability page: the permission gate, the
 * honest 蓝牙已关闭 answer, the scrollable result rows, 连接 → 断开, and the
 * specific failure sentence instead of a bare 失败.
 *
 * The wrapper is replaced here; `__tests__/bluetoothLe.test.ts` covers its own
 * contract and the device run proves the platform side.
 */
import React from 'react';
import renderer from 'react-test-renderer';
import {Text} from 'react-native';
import {beforeEach, expect, it, jest} from '@jest/globals';

import CapabilitiesScreen from '../src/screens/CapabilitiesScreen';
import {
  BleConnectFailure,
  connectDevice,
  disconnectDevice,
  onDeviceDisconnected,
  readBluetoothState,
  startScan,
  stopScan,
} from '../src/native/bluetoothLe';
import {requestPermission} from '../src/native/permissions';

jest.mock('../src/native/permissions', () => {
  const actual = jest.requireActual(
    '../src/native/permissions',
  ) as typeof import('../src/native/permissions');
  return {
    ...actual,
    requestPermission: jest.fn(),
  };
});

jest.mock('../src/native/bluetoothLe', () => {
  const actual = jest.requireActual(
    '../src/native/bluetoothLe',
  ) as typeof import('../src/native/bluetoothLe');
  return {
    ...actual,
    connectDevice: jest.fn(),
    disconnectDevice: jest.fn(),
    onDeviceDisconnected: jest.fn(() => () => {}),
    readBluetoothState: jest.fn(),
    startScan: jest.fn(),
    stopScan: jest.fn(),
  };
});

type MockWith = {
  mockImplementation: (impl: (...args: never[]) => unknown) => void;
  mockImplementationOnce: (impl: (...args: never[]) => unknown) => MockWith;
  mockResolvedValue: (value: unknown) => void;
  mockReturnValue: (value: unknown) => void;
  mock: {calls: unknown[][]};
};

const mockRequestPermission = requestPermission as unknown as MockWith;
const mockReadBluetoothState = readBluetoothState as unknown as MockWith;
const mockStartScan = startScan as unknown as MockWith;
const mockStopScan = stopScan as unknown as MockWith;
const mockConnect = connectDevice as unknown as MockWith;
const mockDisconnect = disconnectDevice as unknown as MockWith;
const mockOnDisconnected = onDeviceDisconnected as unknown as MockWith;

type ScanHandlers = {
  onDevices: (devices: unknown[]) => void;
  onError: (text: string) => void;
};

let lastScan: ScanHandlers;

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
 * `findAll` matches the composite and host node, so testIDs need this filter.
 */
function isHost(node: renderer.ReactTestInstance): boolean {
  return typeof node.type === 'string';
}

/**
 * The visible label of a button. A `Pressable`'s `children` is the style
 * callback, so its text has to be read from the `Text` it renders.
 */
function labelOf(tree: renderer.ReactTestRenderer, testID: string): string {
  const host = tree.root.findAllByProps({testID}).filter(isHost)[0];
  return host
    .findAllByType(Text)
    .map(node => flatten(node.props.children))
    .join('');
}

/** All text inside a container node, joined for a `toContain` assertion. */
function rowText(tree: renderer.ReactTestRenderer, testID: string): string {
  return labelOf(tree, testID);
}

async function render(): Promise<renderer.ReactTestRenderer> {
  let tree: renderer.ReactTestRenderer | undefined;
  await renderer.act(async () => {
    tree = renderer.create(<CapabilitiesScreen onBack={() => {}} />);
  });
  return tree!;
}

function press(
  tree: renderer.ReactTestRenderer,
  testID: string,
): Promise<void> {
  return renderer.act(async () => {
    tree.root.findByProps({testID}).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermission.mockImplementation(() => Promise.resolve('granted'));
  mockReadBluetoothState.mockImplementation(() => Promise.resolve('on'));
  mockStopScan.mockImplementation(() => Promise.resolve(undefined));
  mockStartScan.mockImplementation(handlers => {
    lastScan = handlers as ScanHandlers;
    return Promise.resolve(undefined);
  });
  mockConnect.mockImplementation(() => Promise.resolve(undefined));
  mockDisconnect.mockImplementation(() => Promise.resolve(undefined));
  mockOnDisconnected.mockReturnValue(() => {});
});

it('offers 扫描 with the same hint as KMP and no count before scanning', async () => {
  const tree = await render();

  expect(
    textOf(tree.root.findByProps({testID: 'capability-status-bluetooth-le'})),
  ).toBe('可用');
  expect(labelOf(tree, 'capability-bluetooth-scan')).toBe('扫描');
  // KMP's BluetoothLeRow shows the count only once devices exist and carries a
  // single hint line, so the row has no placeholder and no address note.
  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-count'})),
  ).toBe('');
  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-hint'})),
  ).toBe('点「扫描」查找附近的 BLE 设备');

  renderer.act(() => {
    tree.unmount();
  });
});

it('asks for ACCESS_BLUETOOTH, then lists devices with name, address and RSSI', async () => {
  const tree = await render();

  await press(tree, 'capability-bluetooth-scan');

  expect(mockRequestPermission).toHaveBeenCalledWith('bluetooth');
  expect(mockReadBluetoothState).toHaveBeenCalledTimes(1);
  expect(mockStartScan).toHaveBeenCalledTimes(1);
  expect(labelOf(tree, 'capability-bluetooth-scan')).toBe('停止');

  const devices = [
    {id: '42:3C:9A:F6:85:71', name: 'Speaker', rssi: -45},
    {id: '11:22:33:44:55:66', name: 'Watch', rssi: -72},
  ];
  await renderer.act(async () => {
    lastScan.onDevices(devices);
  });

  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-count'})),
  ).toBe('2 台设备');
  const speakerRow = rowText(
    tree,
    'capability-bluetooth-device-42:3C:9A:F6:85:71',
  );
  expect(speakerRow).toContain('Speaker');
  expect(speakerRow).toContain('42:3C:9A:F6:85:71');
  expect(speakerRow).toContain('RSSI -45');
  expect(
    tree.root
      .findAllByProps({testID: 'capability-bluetooth-devices'})
      .filter(isHost),
  ).toHaveLength(1);
  // One 连接 per device, no capability-level action button.
  expect(
    tree.root
      .findAllByProps({
        testID: 'capability-bluetooth-connect-42:3C:9A:F6:85:71',
      })
      .filter(isHost),
  ).toHaveLength(1);

  renderer.act(() => {
    tree.unmount();
  });
});

it('mounts only a window of rows for a very large scan', async () => {
  const tree = await render();
  await press(tree, 'capability-bluetooth-scan');
  const devices = Array.from({length: 120}, (_, index) => ({
    id: `DEV:${String(index).padStart(4, '0')}`,
    name: `Device ${index}`,
    rssi: -30 - index,
  }));
  await renderer.act(async () => {
    lastScan.onDevices(devices);
  });

  const rowIds = (): string[] =>
    tree.root
      .findAll(
        node =>
          typeof node.type === 'string' &&
          String(node.props.testID ?? '').startsWith(
            'capability-bluetooth-device-',
          ),
      )
      .map(node => String(node.props.testID));

  // 120 rows in the model, at most one window in the tree.
  expect(rowIds().length).toBeGreaterThan(0);
  expect(rowIds().length).toBeLessThanOrEqual(32);
  expect(rowIds()).toContain('capability-bluetooth-device-DEV:0000');
  expect(rowIds()).not.toContain('capability-bluetooth-device-DEV:0119');
  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-count'})),
  ).toBe('120 台设备');

  // Scrolling to the end mounts the last rows instead of the first ones.
  const list = tree.root
    .findAllByProps({testID: 'capability-bluetooth-devices'})
    .filter(isHost)[0];
  await renderer.act(async () => {
    list.props.onScroll({nativeEvent: {contentOffset: {y: 48 * 110}}});
  });
  expect(rowIds()).toContain('capability-bluetooth-device-DEV:0119');
  expect(rowIds()).not.toContain('capability-bluetooth-device-DEV:0000');

  renderer.act(() => {
    tree.unmount();
  });
});

it('turns 连接 into 断开 once the platform connected', async () => {
  const tree = await render();
  await press(tree, 'capability-bluetooth-scan');
  await renderer.act(async () => {
    lastScan.onDevices([{id: 'AA:BB', name: 'Speaker', rssi: -50}]);
  });

  await press(tree, 'capability-bluetooth-connect-AA:BB');

  expect(mockConnect).toHaveBeenCalledWith('AA:BB');
  expect(labelOf(tree, 'capability-bluetooth-connect-AA:BB')).toBe('断开');
  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-message'})),
  ).toBe('已连接 Speaker');

  mockDisconnect.mockImplementationOnce(() => Promise.resolve(undefined));
  await press(tree, 'capability-bluetooth-connect-AA:BB');
  expect(mockDisconnect).toHaveBeenCalledWith('AA:BB');
  expect(labelOf(tree, 'capability-bluetooth-connect-AA:BB')).toBe('连接');

  renderer.act(() => {
    tree.unmount();
  });
});

it('prints the specific connect failure, never a bare 失败', async () => {
  const tree = await render();
  await press(tree, 'capability-bluetooth-scan');
  await renderer.act(async () => {
    lastScan.onDevices([{id: 'AA:BB', name: 'Speaker', rssi: -50}]);
  });
  mockConnect.mockImplementationOnce(() =>
    Promise.reject(
      new BleConnectFailure(
        'timeout',
        '连接失败：连接超时（15 秒内没有完成连接）',
      ),
    ),
  );

  await press(tree, 'capability-bluetooth-connect-AA:BB');

  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-message'})),
  ).toBe('连接失败：连接超时（15 秒内没有完成连接）');
  expect(labelOf(tree, 'capability-bluetooth-connect-AA:BB')).toBe('连接');

  renderer.act(() => {
    tree.unmount();
  });
});

it('prints the wrapper failure when the permission step rejects', async () => {
  const tree = await render();
  mockRequestPermission.mockImplementationOnce(() =>
    Promise.reject(new Error('CapabilityProbe 模块没有注册（权限方法不存在）')),
  );

  await press(tree, 'capability-bluetooth-scan');

  expect(mockStartScan).not.toHaveBeenCalled();
  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-message'})),
  ).toBe('CapabilityProbe 模块没有注册（权限方法不存在）');
  expect(labelOf(tree, 'capability-bluetooth-scan')).toBe('扫描');

  renderer.act(() => {
    tree.unmount();
  });
});

it('says 蓝牙已关闭 instead of showing an empty result list', async () => {
  const tree = await render();
  mockReadBluetoothState.mockImplementationOnce(() => Promise.resolve('off'));

  await press(tree, 'capability-bluetooth-scan');

  expect(mockStartScan).not.toHaveBeenCalled();
  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-message'})),
  ).toContain('蓝牙已关闭');
  expect(
    tree.root
      .findAllByProps({testID: 'capability-bluetooth-hint'})
      .filter(isHost),
  ).toHaveLength(1);

  renderer.act(() => {
    tree.unmount();
  });
});

it('does not scan without the Bluetooth permission', async () => {
  const tree = await render();
  mockRequestPermission.mockImplementationOnce(() => Promise.resolve('denied'));

  await press(tree, 'capability-bluetooth-scan');

  expect(mockStartScan).not.toHaveBeenCalled();
  expect(
    textOf(tree.root.findByProps({testID: 'capability-bluetooth-message'})),
  ).toContain('没有蓝牙权限');

  renderer.act(() => {
    tree.unmount();
  });
});

it('stops the scan on 停止 and flips a platform disconnect back to 连接', async () => {
  const tree = await render();
  await press(tree, 'capability-bluetooth-scan');
  await renderer.act(async () => {
    lastScan.onDevices([{id: 'AA:BB', name: 'Speaker', rssi: -50}]);
  });
  await press(tree, 'capability-bluetooth-connect-AA:BB');

  await press(tree, 'capability-bluetooth-scan');
  expect(mockStopScan).toHaveBeenCalledTimes(1);
  expect(labelOf(tree, 'capability-bluetooth-scan')).toBe('扫描');

  // The platform dropped the link: the row must not keep a stale 断开.
  const listener = mockOnDisconnected.mock.calls[0][0] as (id: string) => void;
  await renderer.act(async () => {
    listener('AA:BB');
  });
  expect(labelOf(tree, 'capability-bluetooth-connect-AA:BB')).toBe('连接');

  renderer.act(() => {
    tree.unmount();
  });
});

/**
 * The WiFi card on the capability page: the scan list and its four honest
 * empty-list sentences, the linked SSID read, the open/ secured connect paths
 * and the system dialog cancellation. The native module is replaced here; the
 * device run proves @ohos.wifiManager and the candidate route.
 */
import React from 'react';
import renderer from 'react-test-renderer';
import {beforeEach, expect, it, jest} from '@jest/globals';

import CapabilitiesScreen from '../src/screens/CapabilitiesScreen';
import {
  connectWifi,
  readCurrentSsid,
  scanWifi,
} from '../src/native/wifiNetwork';
import {requestWifiScanPermission} from '../src/native/permissions';

// The first test renders the screen with a non-empty AP list. On the 2-core CI
// runner that first render has come close to Jest's 5 s default, so give this
// file room instead of letting a slow runner look like a broken card.
jest.setTimeout(20000);

jest.mock('../src/native/permissions', () => {
  const actual = jest.requireActual(
    '../src/native/permissions',
  ) as typeof import('../src/native/permissions');
  return {...actual, requestWifiScanPermission: jest.fn()};
});

jest.mock('../src/native/wifiNetwork', () => ({
  connectWifi: jest.fn(),
  readCurrentSsid: jest.fn(),
  scanWifi: jest.fn(),
}));

type MockWith = {
  mockImplementation: (impl: (...args: never[]) => unknown) => MockWith;
  mockImplementationOnce: (impl: (...args: never[]) => unknown) => MockWith;
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (value: unknown) => void;
  mock: {calls: unknown[][]};
};

const mockScan = scanWifi as unknown as MockWith;
const mockCurrentSsid = readCurrentSsid as unknown as MockWith;
const mockConnect = connectWifi as unknown as MockWith;
const mockRequestWifiScanPermission =
  requestWifiScanPermission as unknown as MockWith;

const AP = {
  ssid: 'KMP-Demo',
  rssi: -45,
  secured: true,
  securityType: 3,
  security: 'WPA2',
};

const OPEN_AP = {
  ssid: 'Guest',
  rssi: -60,
  secured: false,
  securityType: 1,
  security: '开放',
};

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

/** Collects every text below a composite node, including nested Text hosts. */
function textUnder(node: renderer.ReactTestInstance): string {
  const visit = (child: unknown): string => {
    if (typeof child === 'string' || typeof child === 'number') {
      return String(child);
    }
    if (Array.isArray(child)) {
      return child.map(visit).join('');
    }
    if (typeof child === 'object' && child !== null && 'props' in child) {
      return visit((child as {props: {children?: unknown}}).props.children);
    }
    return '';
  };
  return visit(node.props.children);
}

function isHost(node: renderer.ReactTestInstance): boolean {
  return typeof node.type === 'string';
}

function host(tree: renderer.ReactTestRenderer, testID: string) {
  return tree.root.findAllByProps({testID}).filter(isHost);
}

async function press(
  tree: renderer.ReactTestRenderer,
  testID: string,
): Promise<void> {
  const node = tree.root
    .findAllByProps({testID})
    .find(candidate => typeof candidate.props.onPress === 'function');
  if (node === undefined) {
    throw new Error(`没有可点击的 ${testID}`);
  }
  await renderer.act(async () => {
    node.props.onPress();
  });
}

async function render(): Promise<renderer.ReactTestRenderer> {
  let tree: renderer.ReactTestRenderer | undefined;
  await renderer.act(async () => {
    tree = renderer.create(<CapabilitiesScreen onBack={() => {}} />);
  });
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestWifiScanPermission.mockImplementation(() =>
    Promise.resolve('granted'),
  );
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  mockCurrentSsid.mockImplementation(() =>
    Promise.resolve({known: true, ssid: '', reason: ''}),
  );
  mockConnect.mockImplementation(() => Promise.resolve({outcome: 'connected'}));
});

it('lists SSID, RSSI and encryption for every scanned AP', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [AP, OPEN_AP],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  const tree = await render();

  await press(tree, 'capability-wifi-scan');

  expect(host(tree, 'capability-wifi-count')[0].props.children).toBe(
    '共 2 个 AP',
  );
  expect(textUnder(host(tree, 'capability-wifi-ap-0')[0])).toContain(
    'KMP-Demo',
  );
  expect(textUnder(host(tree, 'capability-wifi-ap-0')[0])).toContain(
    'RSSI -45',
  );
  expect(textUnder(host(tree, 'capability-wifi-ap-0')[0])).toContain('WPA2');
  expect(textUnder(host(tree, 'capability-wifi-ap-1')[0])).toContain('Guest');
  expect(textUnder(host(tree, 'capability-wifi-ap-1')[0])).toContain('开放');
  expect(textOf(host(tree, 'capability-wifi-message')[0])).toBe(
    '扫描到 2 个 AP',
  );
  expect(mockRequestWifiScanPermission).toHaveBeenCalledTimes(1);
});

it('reports the location switch, not "no AP nearby", for an empty list', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [],
      wifiActive: true,
      locationEnabled: false,
      reason: '扫描超时，显示系统最近一次扫描结果',
    }),
  );
  const tree = await render();

  await press(tree, 'capability-wifi-scan');

  const message = textOf(host(tree, 'capability-wifi-message')[0]);
  expect(message).toContain('定位开关');
  expect(message).not.toContain('附近没有 AP');
  expect(host(tree, 'capability-wifi-aps')).toHaveLength(0);
});

it('clears a cached list when the location switch is off', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [AP, OPEN_AP],
      wifiActive: true,
      locationEnabled: false,
      reason: '',
    }),
  );
  const tree = await render();

  await press(tree, 'capability-wifi-scan');

  expect(textOf(host(tree, 'capability-wifi-message')[0])).toContain(
    '定位开关',
  );
  expect(host(tree, 'capability-wifi-aps')).toHaveLength(0);
  expect(host(tree, 'capability-wifi-count')[0].props.children).toBe(
    '尚未扫描',
  );
});

it('reports Wi-Fi off instead of an empty scan', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [],
      wifiActive: false,
      locationEnabled: true,
      reason: '',
    }),
  );
  const tree = await render();

  await press(tree, 'capability-wifi-scan');

  expect(textOf(host(tree, 'capability-wifi-message')[0])).toContain(
    'Wi-Fi 未打开',
  );
});

it('keeps a real "no AP" answer when the location switch is on', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  const tree = await render();

  await press(tree, 'capability-wifi-scan');

  expect(textOf(host(tree, 'capability-wifi-message')[0])).toContain(
    '没有发现 WiFi AP',
  );
});

it('shows the platform scan failure instead of an empty list', async () => {
  mockScan.mockImplementation(() =>
    Promise.reject(new Error('读取扫描结果失败：201 Permission denied')),
  );
  const tree = await render();

  await press(tree, 'capability-wifi-scan');

  expect(textOf(host(tree, 'capability-wifi-message')[0])).toBe(
    '扫描失败：读取扫描结果失败：201 Permission denied',
  );
});

it('prints the linked SSID, and 未连接 when the platform says so', async () => {
  mockCurrentSsid
    .mockImplementationOnce(() =>
      Promise.resolve({known: true, ssid: 'KMP-WiFi', reason: ''}),
    )
    .mockImplementationOnce(() =>
      Promise.resolve({known: true, ssid: '', reason: ''}),
    );
  const tree = await render();

  await press(tree, 'capability-wifi-current');
  expect(textOf(host(tree, 'capability-wifi-message')[0])).toBe(
    '当前 SSID：KMP-WiFi',
  );

  await press(tree, 'capability-wifi-current');
  expect(textOf(host(tree, 'capability-wifi-message')[0])).toBe(
    '当前 SSID：未连接 Wi-Fi',
  );
});

it('shows 未知, never a made-up SSID, when the read is refused', async () => {
  mockCurrentSsid.mockImplementation(() =>
    Promise.resolve({
      known: false,
      ssid: '',
      reason: '读取当前 SSID 失败：201 Permission denied',
    }),
  );
  const tree = await render();

  await press(tree, 'capability-wifi-current');

  expect(textOf(host(tree, 'capability-wifi-message')[0])).toBe(
    '读取当前 SSID 失败：读取当前 SSID 失败：201 Permission denied',
  );
});

it('connects to an open AP directly and marks the row 已连接', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [OPEN_AP],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  const tree = await render();
  await press(tree, 'capability-wifi-scan');

  await press(tree, 'capability-wifi-connect-0');

  expect(mockConnect).toHaveBeenCalledWith(OPEN_AP, '');
  expect(textOf(host(tree, 'capability-wifi-message')[0])).toBe(
    '已连接：Guest',
  );
  expect(textUnder(host(tree, 'capability-wifi-connect-0')[0])).toContain(
    '已连接',
  );
});

it('asks a secured AP for its password before connecting', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [AP],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  const tree = await render();
  await press(tree, 'capability-wifi-scan');

  await press(tree, 'capability-wifi-connect-0');
  expect(host(tree, 'capability-wifi-password-panel')).toHaveLength(1);
  expect(mockConnect).not.toHaveBeenCalled();

  await renderer.act(async () => {
    host(tree, 'capability-wifi-password')[0].props.onChangeText('secret-123');
  });
  await press(tree, 'capability-wifi-password-confirm');

  expect(mockConnect).toHaveBeenCalledWith(AP, 'secret-123');
  expect(textOf(host(tree, 'capability-wifi-message')[0])).toBe(
    '已连接：KMP-Demo',
  );
});

it('reports a cancelled system dialog as 已取消, not a failure', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [OPEN_AP],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  mockConnect.mockImplementation(() =>
    Promise.resolve({outcome: 'userDeclined'}),
  );
  const tree = await render();
  await press(tree, 'capability-wifi-scan');

  await press(tree, 'capability-wifi-connect-0');

  expect(textOf(host(tree, 'capability-wifi-message')[0])).toContain(
    '已取消连接：Guest',
  );
});

it('prints the concrete connect failure reason', async () => {
  mockScan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [OPEN_AP],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  mockConnect.mockImplementation(() =>
    Promise.resolve({
      outcome: 'failed',
      reason: '添加候选网络失败：201 Permission denied',
    }),
  );
  const tree = await render();
  await press(tree, 'capability-wifi-scan');

  await press(tree, 'capability-wifi-connect-0');

  expect(textOf(host(tree, 'capability-wifi-message')[0])).toBe(
    '连接失败：添加候选网络失败：201 Permission denied',
  );
});

/**
 * The 蓝牙 LE wrapper's own contract, on top of the app's own `BluetoothLe`
 * module (HarmonyOS ArkTS, Android Java, iOS ObjC++):
 * the three power states, de-duplicated and throttled scan results, the
 * classified connect failures (超时 / 拒绝 / 无权限 / 未知), the JS-side connect
 * deadline, and the disconnect listener.
 *
 * The module itself is replaced here; the device run is what proves
 * `@ohos.bluetooth.ble` (see `docs/features/capabilities.md` §7).
 */
import {beforeEach, expect, it, jest} from '@jest/globals';
import {DeviceEventEmitter} from 'react-native';

// The wrapper caches the module it found, so every test loads a fresh copy
// through jest.resetModules(); this holder is what that copy resolves.
const mockHolder: {module: unknown} = {module: null};

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: () => mockHolder.module,
}));

type BleModule = typeof import('../src/native/bluetoothLe');

type FakeDevice = {id: string; name: string; rssi: number};

type FakeNative = {
  startScan: jest.Mock<() => Promise<void>>;
  stopScan: jest.Mock<() => void>;
  getDevices: jest.Mock<() => FakeDevice[]>;
  connect: jest.Mock<(deviceId: string) => Promise<void>>;
  disconnect: jest.Mock<(deviceId: string) => void>;
  isConnected: jest.Mock<(deviceId: string) => boolean>;
  getState: jest.Mock<() => string>;
};

function fakeNative(): FakeNative {
  return {
    startScan: jest.fn(() => Promise.resolve()),
    stopScan: jest.fn(),
    getDevices: jest.fn<() => FakeDevice[]>(() => []),
    connect: jest.fn(() => Promise.resolve()),
    disconnect: jest.fn(),
    isConnected: jest.fn(() => false),
    getState: jest.fn(() => 'on'),
  };
}

let ble: BleModule;
let native: FakeNative;

beforeEach(() => {
  jest.resetModules();
  jest.useRealTimers();
  native = fakeNative();
  mockHolder.module = native;
  ble = require('../src/native/bluetoothLe') as BleModule;
});

it('reports the module as missing instead of pretending to scan', async () => {
  mockHolder.module = null;
  ble = require('../src/native/bluetoothLe') as BleModule;

  expect(ble.isBluetoothLeAvailable()).toBe(false);
  await expect(ble.readBluetoothState()).rejects.toThrow('蓝牙模块没有注册');
});

it.each([
  // The app's own module answers 'on'/'off'; the adapted ble-plx that the
  // older builds used answered 'PoweredOn'/'PoweredOff'. Both must map.
  ['on', 'on'],
  ['off', 'off'],
  ['PoweredOn', 'on'],
  ['PoweredOff', 'off'],
  ['Resetting', 'unknown'],
  ['Unknown', 'unknown'],
])('maps the platform state %s to %s', async (raw, expected) => {
  native.getState.mockImplementation(() => raw);

  await expect(ble.readBluetoothState()).resolves.toBe(expected);
});

it('de-duplicates scan events and flushes them at a bounded rate', async () => {
  jest.useFakeTimers();
  const devices: (readonly unknown[])[] = [];
  await ble.startScan({
    onDevices: found => devices.push(found),
    onError: () => {},
  });
  expect(native.startScan).toHaveBeenCalledTimes(1);

  // The module keeps the list; the wrapper reads it on its own cadence.
  native.getDevices.mockReturnValue([
    {id: 'AA:BB', name: 'Speaker', rssi: -72},
    {id: 'CC:DD', name: 'Watch', rssi: -45},
  ]);

  // Nothing reaches the page before the first tick.
  expect(devices).toHaveLength(0);
  jest.advanceTimersByTime(400);

  // A weaker repeat of a known id must not replace its RSSI.
  native.getDevices.mockReturnValue([
    {id: 'AA:BB', name: 'Speaker', rssi: -72},
    {id: 'CC:DD', name: 'Watch', rssi: -45},
    {id: 'AA:BB', name: '', rssi: -80},
  ]);
  jest.advanceTimersByTime(400);

  expect(devices).toHaveLength(1);
  expect(devices[0]).toEqual([
    {id: 'CC:DD', name: 'Watch', rssi: -45},
    {id: 'AA:BB', name: 'Speaker', rssi: -72},
  ]);

  // Nothing new on the platform: no redundant render.
  jest.advanceTimersByTime(1200);
  expect(devices).toHaveLength(1);

  await ble.stopScan();
});

it('turns a failing device poll into the row message and stops', async () => {
  jest.useFakeTimers();
  const errors: string[] = [];
  await ble.startScan({
    onDevices: () => {},
    onError: text => errors.push(text),
  });

  native.getDevices.mockImplementation(() => {
    throw new Error('蓝牙已关闭');
  });
  jest.advanceTimersByTime(400);

  expect(errors).toEqual(['扫描中断：蓝牙已关闭']);
  expect(ble.isScanning()).toBe(false);
  expect(native.stopScan).toHaveBeenCalledTimes(1);
});

it('flushes the last results and stops the platform scan on 停止', async () => {
  jest.useFakeTimers();
  const devices: (readonly unknown[])[] = [];
  await ble.startScan({
    onDevices: found => devices.push(found),
    onError: () => {},
  });
  native.getDevices.mockReturnValue([{id: 'AA:BB', name: '', rssi: -72}]);
  jest.advanceTimersByTime(400);
  expect(devices).toHaveLength(1);

  await ble.stopScan();

  expect(native.stopScan).toHaveBeenCalledTimes(1);
  expect(ble.isScanning()).toBe(false);
  // Idempotent: a second stop neither throws nor stops the platform twice.
  await ble.stopScan();
  expect(native.stopScan).toHaveBeenCalledTimes(1);
});

it('reports a refused scan start instead of an empty list', async () => {
  native.startScan.mockImplementation(() =>
    Promise.reject(new Error('未授予蓝牙权限：请在系统设置中允许本 App 使用蓝牙后重试')),
  );

  await expect(
    ble.startScan({onDevices: () => {}, onError: () => {}}),
  ).rejects.toThrow('无法开始扫描：未授予蓝牙权限');
  expect(ble.isScanning()).toBe(false);
});

it('connects and disconnects through the same module', async () => {
  await ble.connectDevice('AA:BB', 1000);
  expect(native.connect).toHaveBeenCalledWith('AA:BB');

  await ble.disconnectDevice('AA:BB');
  expect(native.disconnect).toHaveBeenCalledWith('AA:BB');
});

it('gives up on an unreachable device after the connect deadline', async () => {
  jest.useFakeTimers();
  // A private address that never accepts the link keeps the promise pending.
  native.connect.mockImplementation(() => new Promise(() => {}));

  const attempt = ble.connectDevice('AA:BB');
  // The deadline is armed synchronously before `connectDevice` awaits.
  jest.advanceTimersByTime(ble.CONNECT_TIMEOUT_MS);

  await expect(attempt).rejects.toMatchObject({kind: 'timeout'});
});

it('classifies the platform error codes the card has to distinguish', () => {
  const refused = ble.classifyConnectError(
    JSON.stringify({errorCode: 200, reason: 'Failed to connect.'}),
  );
  expect(refused.kind).toBe('refused');
  expect(refused.message).toContain('连接被拒绝');
  expect(refused.message).toContain('Failed to connect.');

  expect(ble.classifyConnectError(JSON.stringify({errorCode: 101})).kind).toBe(
    'permission',
  );
  expect(ble.classifyConnectError(JSON.stringify({errorCode: 3})).kind).toBe(
    'timeout',
  );
  expect(
    ble.classifyConnectError(JSON.stringify({errorCode: 0, reason: 'boom'}))
      .kind,
  ).toBe('unknown');
  // A platform sentence without a numeric code still classifies.
  expect(
    ble.classifyConnectError(JSON.stringify({reason: 'Connection timed out'}))
      .kind,
  ).toBe('timeout');
});

it('notices a link the platform dropped and tells the listener', async () => {
  jest.useFakeTimers();
  const seen: string[] = [];
  const unsubscribe = ble.onDeviceDisconnected(id => seen.push(id));

  native.isConnected.mockReturnValue(true);
  await ble.connectDevice('AA:BB', 1000);

  // The peripheral goes away on its own: the module starts answering false.
  native.isConnected.mockReturnValue(false);
  jest.advanceTimersByTime(ble.DISCONNECT_POLL_MS * 2);

  expect(seen).toEqual(['AA:BB']);
  unsubscribe();
});

it('reports platform-reported disconnections and stops when unsubscribed', () => {
  const seen: string[] = [];
  const unsubscribe = ble.onDeviceDisconnected(id => seen.push(id));

  DeviceEventEmitter.emit('DisconnectionEvent', [null, {id: 'AA:BB'}]);
  expect(seen).toEqual(['AA:BB']);

  unsubscribe();
  DeviceEventEmitter.emit('DisconnectionEvent', [null, {id: 'AA:BB'}]);
  expect(seen).toHaveLength(1);
});

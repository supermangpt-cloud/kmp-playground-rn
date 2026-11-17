/**
 * The 蓝牙 LE wrapper's own contract, on top of the HarmonyOS `BlePlx` module:
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

type FakeNative = {
  createClient: jest.Mock<(restoreStateIdentifier?: string | null) => void>;
  destroyClient: jest.Mock<() => Promise<void>>;
  state: jest.Mock<() => Promise<unknown>>;
  startDeviceScan: jest.Mock<
    (
      filteredUUIDs: string[] | null,
      options: Record<string, unknown> | null,
    ) => Promise<void>
  >;
  stopDeviceScan: jest.Mock<() => Promise<void>>;
  connectToDevice: jest.Mock<
    (deviceId: string, options?: Record<string, unknown>) => Promise<unknown>
  >;
  cancelDeviceConnection: jest.Mock<(deviceId: string) => Promise<unknown>>;
  isDeviceConnected: jest.Mock<(deviceId: string) => Promise<boolean>>;
};

function fakeNative(): FakeNative {
  return {
    createClient: jest.fn(),
    destroyClient: jest.fn(() => Promise.resolve()),
    state: jest.fn(() => Promise.resolve('PoweredOn')),
    startDeviceScan: jest.fn(() => Promise.resolve()),
    stopDeviceScan: jest.fn(() => Promise.resolve()),
    connectToDevice: jest.fn(() => Promise.resolve({})),
    cancelDeviceConnection: jest.fn(() => Promise.resolve({})),
    isDeviceConnected: jest.fn(() => Promise.resolve(false)),
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
  await expect(ble.readBluetoothState()).rejects.toThrow('BlePlx 模块没有注册');
});

it.each([
  ['PoweredOn', 'on'],
  ['PoweredOff', 'off'],
  ['Resetting', 'unknown'],
  ['Unknown', 'unknown'],
])('maps the platform state %s to %s', async (raw, expected) => {
  native.state.mockImplementation(() => Promise.resolve(raw));

  await expect(ble.readBluetoothState()).resolves.toBe(expected);
  expect(native.createClient).toHaveBeenCalledTimes(1);
});

it('de-duplicates scan events and flushes them at a bounded rate', async () => {
  jest.useFakeTimers();
  const devices: (readonly unknown[])[] = [];
  await ble.startScan({
    onDevices: found => devices.push(found),
    onError: () => {},
  });
  expect(native.startDeviceScan).toHaveBeenCalledWith(null, {scanMode: 2});

  DeviceEventEmitter.emit('ScanEvent', [
    null,
    {id: 'AA:BB', name: 'Speaker', rssi: -72},
  ]);
  DeviceEventEmitter.emit('ScanEvent', [
    null,
    {id: 'CC:DD', name: 'Watch', rssi: -45},
  ]);
  // Same id again: the newer RSSI wins and an empty name keeps the old one.
  DeviceEventEmitter.emit('ScanEvent', [
    null,
    {id: 'AA:BB', name: '', rssi: -60},
  ]);

  // Nothing reaches the page per event: the page re-renders at most every
  // SCAN_FLUSH_MS, not once per advertisement.
  expect(devices).toHaveLength(0);
  jest.advanceTimersByTime(400);

  expect(devices).toHaveLength(1);
  expect(devices[0]).toEqual([
    {id: 'CC:DD', name: 'Watch', rssi: -45},
    {id: 'AA:BB', name: 'Speaker', rssi: -60},
  ]);

  // No new advertisement: no redundant render.
  jest.advanceTimersByTime(400);
  expect(devices).toHaveLength(1);

  await ble.stopScan();
});

it('turns a scan error event into the row message', async () => {
  const errors: string[] = [];
  await ble.startScan({
    onDevices: () => {},
    onError: text => errors.push(text),
  });

  DeviceEventEmitter.emit(
    'ScanEvent',
    JSON.stringify({errorCode: 600, reason: 'Scan start failed.'}),
  );

  expect(errors).toEqual(['扫描失败：Scan start failed.']);
  await ble.stopScan();
});

it('flushes the last results and stops the platform scan on 停止', async () => {
  jest.useFakeTimers();
  const devices: (readonly unknown[])[] = [];
  await ble.startScan({
    onDevices: found => devices.push(found),
    onError: () => {},
  });
  DeviceEventEmitter.emit('ScanEvent', [null, {id: 'AA:BB', rssi: -72}]);

  await ble.stopScan();

  expect(devices).toHaveLength(1);
  expect(native.stopDeviceScan).toHaveBeenCalledTimes(1);
  expect(ble.isScanning()).toBe(false);
  // Idempotent: a second stop neither throws nor stops the platform twice.
  await ble.stopScan();
  expect(native.stopDeviceScan).toHaveBeenCalledTimes(1);
});

it('reports a refused scan start instead of an empty list', async () => {
  native.startDeviceScan.mockImplementation(() =>
    Promise.reject(
      JSON.stringify({errorCode: 600, reason: 'Permission denied.'}),
    ),
  );

  await expect(
    ble.startScan({onDevices: () => {}, onError: () => {}}),
  ).rejects.toThrow('无法开始扫描：Permission denied.');
  expect(ble.isScanning()).toBe(false);
});

it('connects and disconnects through the same module', async () => {
  await ble.connectDevice('AA:BB', 1000);
  expect(native.connectToDevice).toHaveBeenCalledWith('AA:BB', {
    timeout: 1000,
  });

  await ble.disconnectDevice('AA:BB');
  expect(native.cancelDeviceConnection).toHaveBeenCalledWith('AA:BB');
});

it('gives up on an unreachable device after the connect deadline', async () => {
  jest.useFakeTimers();
  // The ArkTS side never settles for a refused private address.
  native.connectToDevice.mockImplementation(() => new Promise(() => {}));

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

it('reports a refused disconnect with the platform reason', async () => {
  native.cancelDeviceConnection.mockImplementation(() =>
    Promise.reject(
      JSON.stringify({errorCode: 204, reason: 'The device is not connected.'}),
    ),
  );

  await expect(ble.disconnectDevice('AA:BB')).rejects.toThrow(
    '断开失败：The device is not connected.',
  );
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

/**
 * JS side of the `BlePlx` native module, shared by all three platforms.
 *
 * The module is the ArkTS `BlePlx` implementation on HarmonyOS (registered by
 * the adapted package's `BlePlxPackage`) and the official
 * `react-native-ble-plx` module on Android and iOS (autolinked). The official
 * `BleManager` wrapper is not used on any platform: on HarmonyOS it binds
 * through RN 0.72's `TurboModuleRegistry`, which checks the legacy
 * `NativeModules` table first, and RNOH answers every name with an empty stub.
 * Asking the module directly works on every platform.
 *
 * Three behaviours live here because the raw module does not provide them:
 *
 * - **A connect timeout.** `connectToDevice` only settles on the platform's
 *   connected event, so a device that refuses the link would leave the promise
 *   pending forever. The call is raced against `CONNECT_TIMEOUT_MS` and a
 *   success that arrives after the timeout is disconnected again.
 * - **A classified failure.** The card has to say *why* a connection failed
 *   (timeout / refused / no permission / unknown) instead of a bare 「失败」.
 *   A rejection carries the library's `errorCode` and the platform reason;
 *   `classifyConnectError` turns that into the four cases.
 * - **Throttled scan results.** A busy room produces many `ScanEvent`s per
 *   second; the found devices are de-duplicated by id and flushed to the page
 *   every `SCAN_FLUSH_MS`, so the row list re-renders at a bounded rate.
 *
 * Addresses: Android reports the device MAC, iOS a system-assigned UUID, and
 * HarmonyOS (without `GET_BLUETOOTH_PEERS_MAC`) a per-app virtual id. The page
 * shows whatever the platform gave and passes it back to connect.
 */
import {DeviceEventEmitter, EmitterSubscription} from 'react-native';

import {getTurboModule} from './turboModule';

/** One scanned advertisement, reduced to what the card prints. */
export type BleDevice = {
  /** Platform device address: MAC on Android, UUID on iOS, virtual id on HarmonyOS. */
  id: string;
  name?: string;
  rssi?: number;
};

/** The three states the card distinguishes; anything else is `unknown`. */
export type BluetoothPowerState = 'on' | 'off' | 'unknown';

/** Why a connection did not end in `connected`. */
export type ConnectFailureKind =
  | 'timeout'
  | 'refused'
  | 'permission'
  | 'unknown';

/** The platform gives up on an unreachable address after about 15 s. */
export const CONNECT_TIMEOUT_MS = 15000;

/** How often accumulated scan results are pushed to the page. */
const SCAN_FLUSH_MS = 400;

export class BleConnectFailure extends Error {
  readonly kind: ConnectFailureKind;

  constructor(kind: ConnectFailureKind, message: string) {
    super(message);
    this.name = 'BleConnectFailure';
    this.kind = kind;
  }
}

type NativeBleDevice = {
  id?: unknown;
  name?: unknown;
  rssi?: unknown;
};

type NativeBlePlx = {
  destroyClient: () => Promise<void>;
  startScan: () => Promise<void>;
  stopScan: () => void;
  getDevices: () => Array<{id: string; name: string; rssi: number}>;
  connect: (deviceId: string) => Promise<void>;
  disconnect: (deviceId: string) => void;
  isConnected: (deviceId: string) => boolean;
  getState: () => string;
};

type ScanHandlers = {
  onDevices: (devices: BleDevice[]) => void;
  onError: (text: string) => void;
};

type ActiveScan = {
  found: Map<string, BleDevice>;
  handlers: ScanHandlers;
  subscription: EmitterSubscription | null;
  timer: ReturnType<typeof setInterval>;
  dirty: boolean;
};

let native: NativeBlePlx | null = null;
let clientCreated = false;
let activeScan: ActiveScan | null = null;

/**
 * The registered `BlePlx` module, or `null` when the platform's native module
 * was not installed. On HarmonyOS calling this instantiates the ArkTS module,
 * whose constructor asks for `ohos.permission.ACCESS_BLUETOOTH`; the page asks
 * for the platform's Bluetooth permission first, so the dialog appears on the
 * button press rather than on page open.
 */
function nativeModule(): NativeBlePlx | null {
  if (native !== null) {
    return native;
  }
  const module = getTurboModule<NativeBlePlx>('BluetoothLe');
  if (
    module === null ||
    typeof module.startScan !== 'function' ||
    typeof module.getDevices !== 'function' ||
    typeof module.connect !== 'function'
  ) {
    return null;
  }
  native = module;
  return module;
}

function requireModule(): NativeBlePlx {
  const module = nativeModule();
  if (module === null) {
    throw new Error('BlePlx 模块没有注册（本平台的蓝牙模块没有装进工程）');
  }
  return module;
}

function requireClient(): NativeBlePlx {
  const module = requireModule();
  if (!clientCreated) {
    clientCreated = true;
  }
  return module;
}

/** Whether the platform's BLE module is present; call this from an action, not render. */
export function isBluetoothLeAvailable(): boolean {
  return nativeModule() !== null;
}

function asDevice(value: unknown): BleDevice | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as NativeBleDevice;
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    return null;
  }
  return {
    id: raw.id,
    name:
      typeof raw.name === 'string' && raw.name.length > 0
        ? raw.name
        : undefined,
    rssi: typeof raw.rssi === 'number' ? raw.rssi : undefined,
  };
}

/** Newest advertisement wins, but an empty name never erases a known one. */
function mergeDevice(
  previous: BleDevice | undefined,
  next: BleDevice,
): BleDevice {
  return {
    id: next.id,
    name: next.name ?? previous?.name,
    rssi: next.rssi ?? previous?.rssi,
  };
}

/** Strongest signal first; unknown RSSI last; id breaks ties. */
export function sortDevices(devices: BleDevice[]): BleDevice[] {
  return [...devices].sort((left, right) => {
    const leftRssi = left.rssi;
    const rightRssi = right.rssi;
    if (
      leftRssi !== undefined &&
      rightRssi !== undefined &&
      leftRssi !== rightRssi
    ) {
      return rightRssi - leftRssi;
    }
    if (leftRssi === undefined && rightRssi !== undefined) {
      return 1;
    }
    if (leftRssi !== undefined && rightRssi === undefined) {
      return -1;
    }
    return left.id.localeCompare(right.id);
  });
}

function deviceList(found: Map<string, BleDevice>): BleDevice[] {
  return sortDevices([...found.values()]);
}

type ErrorPayload = {
  errorCode?: number;
  reason?: string;
  harmonyErrorCode?: number;
};

/** The ArkTS side rejects (and emits scan errors) with a JSON string. */
function parseErrorPayload(value: unknown): ErrorPayload {
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as ErrorPayload;
      }
    } catch {
      return {reason: value};
    }
    return {reason: value};
  }
  if (value instanceof Error) {
    const fromMessage = parseErrorPayload(value.message);
    if (
      fromMessage.reason !== undefined ||
      fromMessage.errorCode !== undefined
    ) {
      return fromMessage;
    }
    return {reason: value.message};
  }
  if (typeof value === 'object' && value !== null) {
    const {errorCode, reason, harmonyErrorCode} = value as {
      errorCode?: unknown;
      reason?: unknown;
      harmonyErrorCode?: unknown;
    };
    return {
      errorCode: typeof errorCode === 'number' ? errorCode : undefined,
      reason:
        typeof reason === 'string' && reason.length > 0 ? reason : undefined,
      harmonyErrorCode:
        typeof harmonyErrorCode === 'number' ? harmonyErrorCode : undefined,
    };
  }
  return {};
}

/** A one-line explanation of a rejected operation, for the row's message. */
export function describeBleError(error: unknown, fallback: string): string {
  const payload = parseErrorPayload(error);
  return payload.reason ?? fallback;
}

const TIMEOUT_PATTERN = /timeout|timed out|超时/i;
const REFUSED_PATTERN = /refus|reject|denied|not allowed|拒绝|不允许/i;

/** The sentence every timeout path prints, including the JS-side deadline. */
export function connectTimeoutMessage(
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): string {
  return `连接失败：连接超时（${Math.round(
    timeoutMs / 1000,
  )} 秒内没有完成连接）`;
}

/** Turns a rejected connect into the reason the card prints. */
export function classifyConnectError(
  error: unknown,
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): BleConnectFailure {
  const {errorCode, reason} = parseErrorPayload(error);
  const detail = reason === undefined ? '' : `（${reason}）`;
  // OperationTimedOut
  if (
    errorCode === 3 ||
    (reason !== undefined && TIMEOUT_PATTERN.test(reason))
  ) {
    return new BleConnectFailure('timeout', connectTimeoutMessage(timeoutMs));
  }
  // BluetoothUnauthorized
  if (errorCode === 101) {
    return new BleConnectFailure('permission', '连接失败：没有蓝牙权限');
  }
  // DeviceConnectionFailed / DeviceDisconnected / DeviceAlreadyConnected /
  // DeviceNotFound / DeviceNotConnected, or a platform refusal sentence.
  if (
    errorCode === 200 ||
    errorCode === 201 ||
    errorCode === 203 ||
    errorCode === 204 ||
    errorCode === 205 ||
    (reason !== undefined && REFUSED_PATTERN.test(reason))
  ) {
    return new BleConnectFailure('refused', `连接失败：连接被拒绝${detail}`);
  }
  return new BleConnectFailure(
    'unknown',
    `连接失败：未知原因${detail === '' ? '' : detail}`,
  );
}

function asPowerState(value: unknown): BluetoothPowerState {
  // The app's own module answers 'on'/'off'; the adapted ble-plx answered
  // 'PoweredOn'/'PoweredOff'. Accept both so the wrapper keeps working on the
  // platforms that still use the library.
  if (value === 'on' || value === 'PoweredOn') {
    return 'on';
  }
  if (value === 'off' || value === 'PoweredOff') {
    return 'off';
  }
  return 'unknown';
}

/** Reads the platform's Bluetooth state; creates the native client on first call. */
export async function readBluetoothState(): Promise<BluetoothPowerState> {
  try {
    return asPowerState(requireClient().getState());
  } catch (error) {
    throw new Error(`读取蓝牙状态失败：${describeBleError(error, '未知原因')}`);
  }
}

/** Splits one `ScanEvent` payload into an error or a device. */
function readScanPayload(payload: unknown): {
  error?: ErrorPayload;
  device?: BleDevice;
} {
  if (Array.isArray(payload)) {
    const [errorValue, deviceValue] = payload as unknown[];
    const device = asDevice(deviceValue);
    if (device !== null) {
      return {device};
    }
    if (errorValue !== null && errorValue !== undefined) {
      return {error: parseErrorPayload(errorValue)};
    }
    return {};
  }
  const device = asDevice(payload);
  if (device !== null) {
    return {device};
  }
  if (payload !== null && payload !== undefined) {
    return {error: parseErrorPayload(payload)};
  }
  return {};
}

/** Stops the current scan and flushes the last results; safe to call twice. */
export async function stopScan(): Promise<void> {
  const scan = activeScan;
  if (scan === null) {
    return;
  }
  activeScan = null;
  if (scan.subscription !== null) {
    scan.subscription.remove();
  }
  clearInterval(scan.timer);
  if (scan.dirty) {
    scan.handlers.onDevices(deviceList(scan.found));
  }
  try {
    requireModule().stopScan();
  } catch {
    // The platform may already have stopped the scan (Bluetooth switched
    // off); there is nothing left to stop and no reason to fail the page.
  }
}

/**
 * Starts a scan and reports the accumulated devices on a fixed interval.
 *
 * Rejects when the platform refuses to start scanning (typically a missing
 * ACCESS_BLUETOOTH grant or Bluetooth being off); the page keeps its previous
 * list in that case rather than showing an empty one.
 */
export async function startScan(handlers: ScanHandlers): Promise<void> {
  await stopScan();
  const module = requireClient();
  // The native module keeps the discovered list and hands it over on demand,
  // so the timer both refreshes it and repaints; there is no bridge event to
  // subscribe to (which also keeps a busy room from crossing the boundary for
  // every advertisement).
  const scan: ActiveScan = {
    found: new Map(),
    handlers,
    subscription: null,
    timer: setInterval(() => {
      try {
        for (const device of module.getDevices()) {
          scan.found.set(device.id, mergeDevice(scan.found.get(device.id), device));
        }
      } catch (error) {
        handlers.onError(`扫描中断：${describeBleError(error, '未知原因')}`);
        void stopScan();
        return;
      }
      handlers.onDevices(deviceList(scan.found));
    }, SCAN_FLUSH_MS),
    dirty: false,
  };
  activeScan = scan;
  try {
    await module.startScan();
  } catch (error) {
    await stopScan();
    throw new Error(`无法开始扫描：${describeBleError(error, '未知原因')}`);
  }
}

/** True while a scan started by `startScan` is running. */
export function isScanning(): boolean {
  return activeScan !== null;
}

/**
 * Connects one device, rejecting with a `BleConnectFailure` after at most
 * `timeoutMs`. A success that arrives after the timeout is disconnected again
 * so the platform does not keep a link the page already reported as failed.
 */
export async function connectDevice(
  deviceId: string,
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): Promise<void> {
  const module = requireClient();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const attempt = Promise.resolve().then(() => module.connect(deviceId));
  const connected = attempt.then(
    () => undefined,
    error => {
      throw classifyConnectError(error, timeoutMs);
    },
  );
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(
        new BleConnectFailure('timeout', connectTimeoutMessage(timeoutMs)),
      );
    }, timeoutMs);
  });

  try {
    await Promise.race([connected, timeout]);
  } catch (error) {
    if (timedOut) {
      // Observe the late settlement: success means the platform did connect,
      // and the page has already told the user it failed.
      attempt.then(
        () => {
          module.disconnect(deviceId);
        },
        () => {},
      );
    }
    throw error;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

/** Disconnects one device; rejects when the platform will not close it. */
export async function disconnectDevice(deviceId: string): Promise<void> {
  try {
    requireClient().disconnect(deviceId);
  } catch (error) {
    throw new Error(
      `断开失败：${describeBleError(error, '未知原因（设备可能已经断开）')}`,
    );
  }
}

/**
 * Listens for disconnections the platform reports on its own (the peripheral
 * went away, or the system dropped the link). Returns an unsubscribe function.
 */
export function onDeviceDisconnected(
  listener: (deviceId: string) => void,
): () => void {
  const subscription = DeviceEventEmitter.addListener(
    'DisconnectionEvent',
    (payload: unknown) => {
      const [, deviceValue] = Array.isArray(payload)
        ? (payload as unknown[])
        : [null, payload];
      const device = asDevice(deviceValue);
      if (device !== null) {
        listener(device.id);
      }
    },
  );
  return () => subscription.remove();
}

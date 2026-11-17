/**
 * JS side of the app's `WifiNetwork` module: scanning nearby access points,
 * reading the linked SSID, and connecting (HarmonyOS candidate-network route on
 * HarmonyOS; `WifiNetworkSpecifier` on Android; unavailable on iOS, where the
 * row is marked `limited`).
 *
 * The native side returns structured payloads rather than rejecting for the
 * expected answers (Wi-Fi off, location switch off, the system trust dialog
 * cancelled), because the card has to print a different sentence for each. A
 * rejection is reserved for a missing module or a payload that breaks this
 * contract.
 *
 * The hard constraint from the ticket is in the native module: connecting uses
 * `addCandidateConfig()` + `connectToCandidateConfigWithUserAction()`, never
 * `connectToNetwork()`, which requires the system_core MANAGE_WIFI_CONNECTION
 * permission a normal app cannot hold.
 */
import {getTurboModule} from './turboModule';

/** One scanned access point, as the card prints it. */
export type WifiAccessPoint = {
  ssid: string;
  /** dBm; stronger (closer to zero) is better. */
  rssi: number;
  /** True for WEP / WPA / WPA2 / WPA3 / EAP / OWE / WAPI. */
  secured: boolean;
  /** `wifiManager.WifiSecurityType`, passed back to connect. */
  securityType: number;
  /** 开放 / WEP / WPA / WPA2 / WPA3 / EAP / OWE / WAPI / 加密. */
  security: string;
};

/** One scan: the list plus the switches that decide what an empty list means. */
export type WifiScanResult = {
  accessPoints: WifiAccessPoint[];
  /** False when Wi-Fi is off; an empty list then is not "no AP nearby". */
  wifiActive: boolean;
  /** The system location switch; false means an empty list is expected. */
  locationEnabled: boolean;
  /** '' or why the refresh/list read did not produce a fresh answer. */
  reason: string;
};

/** The result of one connect attempt. */
export type WifiConnectResult =
  | {outcome: 'connected'}
  | {outcome: 'userDeclined'}
  | {outcome: 'failed'; reason: string};

/** One read of the linked network; `known: false` is a real refusal. */
export type WifiSsidResult = {
  known: boolean;
  /** '' when not linked, or when the platform refused to tell. */
  ssid: string;
  reason: string;
};

type NativeWifiNetwork = {
  scan: () => Promise<unknown>;
  connect: (
    ssid: string,
    password: string,
    securityType: number,
  ) => Promise<unknown>;
  currentSsid: () => Promise<unknown>;
};

/** The two answers every scan row needs; a payload missing one is a bug. */
const OUTCOMES: readonly string[] = ['connected', 'userDeclined', 'failed'];

function requireModule(): NativeWifiNetwork {
  const module = getTurboModule<NativeWifiNetwork>('WifiNetwork');
  if (
    module === null ||
    typeof module.scan !== 'function' ||
    typeof module.connect !== 'function' ||
    typeof module.currentSsid !== 'function'
  ) {
    throw new Error('WifiNetwork 模块没有注册（本平台没有 WiFi 实现）');
  }
  return module;
}

function reasonOf(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const {message, code} = error as {message?: unknown; code?: unknown};
    if (typeof message === 'string' && message.length > 0) {
      return code === undefined
        ? message
        : `${message}（code ${String(code)}）`;
    }
  }
  return fallback;
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asAccessPoint(value: unknown): WifiAccessPoint {
  const record = value as Record<string, unknown>;
  if (typeof record?.ssid !== 'string' || record.ssid.length === 0) {
    throw new Error('WiFi 模块返回了没有 SSID 的 AP');
  }
  if (typeof record.rssi !== 'number' || !Number.isFinite(record.rssi)) {
    throw new Error(`WiFi 模块返回了无效的 RSSI：${String(record.rssi)}`);
  }
  if (typeof record.securityType !== 'number') {
    throw new Error(
      `WiFi 模块返回了无效的加密类型：${String(record.securityType)}`,
    );
  }
  return {
    ssid: record.ssid,
    rssi: record.rssi,
    secured: record.secured === true,
    securityType: record.securityType,
    security: stringOf(record.security) || '加密',
  };
}

/** Whether the HarmonyOS Wi-Fi module is registered in this build. */
export function isWifiAvailable(): boolean {
  const module = getTurboModule<NativeWifiNetwork>('WifiNetwork');
  return module !== null && typeof module.scan === 'function';
}

/**
 * Asks for a fresh scan (the native side waits for `wifiScanStateChange` and
 * falls back to the system cache), then returns the list plus the Wi-Fi and
 * location switch states. Rejects only for a missing module or a broken payload.
 */
export async function scanWifi(): Promise<WifiScanResult> {
  let payload: unknown;
  try {
    payload = await requireModule().scan();
  } catch (error) {
    throw new Error(reasonOf(error, 'WiFi 扫描失败'));
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('WiFi 扫描返回了无法识别的结果');
  }
  const value = payload as Record<string, unknown>;
  const list = value.accessPoints;
  if (!Array.isArray(list)) {
    throw new Error('WiFi 扫描没有返回 AP 列表');
  }
  return {
    accessPoints: list.map(asAccessPoint),
    wifiActive: value.wifiActive === true,
    locationEnabled: value.locationEnabled === true,
    reason: stringOf(value.reason),
  };
}

/**
 * Connects to one AP through the candidate route. `password` is ignored for an
 * open AP; a secured one needs the key the user typed.
 */
export async function connectWifi(
  accessPoint: WifiAccessPoint,
  password: string,
): Promise<WifiConnectResult> {
  if (typeof accessPoint?.ssid !== 'string' || accessPoint.ssid.length === 0) {
    throw new Error('没有指定要连接的 SSID');
  }
  let payload: unknown;
  try {
    payload = await requireModule().connect(
      accessPoint.ssid,
      accessPoint.secured ? password : '',
      accessPoint.securityType,
    );
  } catch (error) {
    throw new Error(reasonOf(error, '连接 WiFi 失败'));
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('连接 WiFi 返回了无法识别的结果');
  }
  const value = payload as Record<string, unknown>;
  const outcome = stringOf(value.outcome);
  if (!OUTCOMES.includes(outcome)) {
    throw new Error(`连接 WiFi 返回了未知结果：${outcome}`);
  }
  if (outcome === 'failed') {
    return {
      outcome: 'failed',
      reason: stringOf(value.reason) || '平台没有给出失败原因',
    };
  }
  return {outcome: outcome as 'connected' | 'userDeclined'};
}

/** Reads the linked SSID afresh; nothing is cached between calls. */
export async function readCurrentSsid(): Promise<WifiSsidResult> {
  let payload: unknown;
  try {
    payload = await requireModule().currentSsid();
  } catch (error) {
    throw new Error(reasonOf(error, '读取当前 SSID 失败'));
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('读取当前 SSID 返回了无法识别的结果');
  }
  const value = payload as Record<string, unknown>;
  return {
    known: value.known === true,
    ssid: stringOf(value.ssid),
    reason: stringOf(value.reason),
  };
}

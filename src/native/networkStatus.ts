/**
 * JS side of the app's `CapabilityProbe` module for the 网络状态 row.
 *
 * The native method reads the platform's current network and its transport
 * afresh on every call (`@ohos.net.connection`, `ConnectivityManager`, or
 * `NWPathMonitor`), so switching Wi-Fi off and pressing 「查询网络」 again
 * reports the new state instead of a cached one.
 *
 * `unknown` is a real answer: a default network whose transport is none of
 * Wi-Fi / cellular / ethernet is reported as 未知 instead of being guessed into
 * one of them.
 */
import {getTurboModule} from './turboModule';

export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

/** One reading of the current network: whether traffic can leave, and how. */
export type NetworkStatus = {
  connected: boolean;
  type: NetworkType;
};

type NativeCapabilityProbe = {
  readNetworkStatus: () => Promise<NetworkStatus>;
};

const TYPES: readonly NetworkType[] = [
  'wifi',
  'cellular',
  'ethernet',
  'none',
  'unknown',
];

function requireProbe(): NativeCapabilityProbe {
  const module = getTurboModule<NativeCapabilityProbe>('CapabilityProbe');
  if (module === null || typeof module.readNetworkStatus !== 'function') {
    throw new Error('CapabilityProbe 模块没有注册（readNetworkStatus 不存在）');
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

/** Reads the network state at this moment; nothing is cached between calls. */
export async function readNetworkStatus(): Promise<NetworkStatus> {
  let status: NetworkStatus;
  try {
    status = await requireProbe().readNetworkStatus();
  } catch (error) {
    throw new Error(reasonOf(error, '读取网络状态失败'));
  }
  if (typeof status?.connected !== 'boolean' || !TYPES.includes(status.type)) {
    throw new Error('网络状态模块返回了不完整的数据');
  }
  // A network that can send traffic has a transport; a disconnected one has
  // none. A payload that says otherwise is a module bug, not a state to show.
  if (status.connected === (status.type === 'none')) {
    throw new Error(`网络状态模块返回了矛盾的数据：${status.type}`);
  }
  return status;
}

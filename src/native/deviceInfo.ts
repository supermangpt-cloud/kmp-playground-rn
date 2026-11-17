/**
 * JS side of the app's `CapabilityProbe` ArkTS module for the 设备信息 row.
 *
 * The ArkTS module is registered by
 * `harmony/entry/src/main/ets/capabilities/CapabilityProbePackage.ets`; it reads
 * `@ohos.deviceInfo` and `bundleManager` on the device, so the row shows the
 * real model, system version and app build instead of sample values.
 *
 * `getTurboModule` is used directly for the same reason as the other HarmonyOS
 * wrappers: RN 0.72's `TurboModuleRegistry` checks the legacy `NativeModules`
 * table first, and RNOH answers every name there with an empty stub.
 */
import {getTurboModule} from './turboModule';

/** What the device and this app build really are, as the platform reports it. */
export type DeviceInfo = {
  /** Hardware model, e.g. `ALN-AL00`. */
  model: string;
  /** Operating system name, e.g. `HarmonyOS`. */
  systemName: string;
  /** Operating system version, e.g. `7.0.0.111(SP10C00E111R4P3)`. */
  systemVersion: string;
  /** Human-readable application name from the app bundle. */
  appName: string;
  /** Application version from the app bundle. */
  appVersion: string;
};

type NativeCapabilityProbe = {
  readDeviceInfo: () => Promise<DeviceInfo>;
};

function requireProbe(): NativeCapabilityProbe {
  const module = getTurboModule<NativeCapabilityProbe>('CapabilityProbe');
  if (module === null || typeof module.readDeviceInfo !== 'function') {
    throw new Error('CapabilityProbe 模块没有注册（readDeviceInfo 不存在）');
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

/** Reads the real model, system name/version and app name/version. */
export async function readDeviceInfo(): Promise<DeviceInfo> {
  let info: DeviceInfo;
  try {
    info = await requireProbe().readDeviceInfo();
  } catch (error) {
    throw new Error(reasonOf(error, '读取设备信息失败'));
  }
  if (
    typeof info?.model !== 'string' ||
    typeof info.systemName !== 'string' ||
    typeof info.systemVersion !== 'string' ||
    typeof info.appName !== 'string' ||
    typeof info.appVersion !== 'string' ||
    info.model.length === 0 ||
    info.systemVersion.length === 0 ||
    info.appName.length === 0 ||
    info.appVersion.length === 0
  ) {
    throw new Error('设备信息模块返回了不完整的数据');
  }
  return info;
}

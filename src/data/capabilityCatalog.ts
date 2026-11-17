/**
 * Per-platform overrides for the capability rows' status.
 *
 * `src/data/capabilities.ts` keeps the base definitions and the HarmonyOS
 * statuses (the platform the page was originally built and verified on). This
 * file is the Android profile: the official cross-platform libraries and the
 * app's own Android modules implement every row, so the one HarmonyOS-only
 * limitation (clipboard reads behind the PasteButton) no longer applies.
 *
 * Metro picks `capabilityCatalog.ios.ts` or `capabilityCatalog.harmony.ts` on
 * those platforms; this file is also the one TypeScript type-checks.
 */
import type {CapabilityStatus} from './capabilities';

export type CapabilityStatusOverride = {
  status: CapabilityStatus;
  limitation?: string;
};

export const WIFI_NOTE =
  '扫描读取系统的 AP 列表（Android 13+ 需要「附近的设备 / 定位」授权与系统定位开关）。连接走系统的 WifiNetworkSpecifier：在弹出的确认框里取消显示为「已取消」。当前 SSID 在缺少定位权限或定位关闭时会如实显示未知。';

export const BLUETOOTH_NOTE =
  '地址是平台提供的设备标识（Android 是设备 MAC，iOS 是系统分配的 UUID）；附近有一部分 BLE 广播不可连接，连接会等到超时。';

export const CAPABILITY_STATUS_OVERRIDES: Readonly<
  Record<string, CapabilityStatusOverride>
> = {
  clipboard: {status: 'available'},
};

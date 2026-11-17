/**
 * iOS profile for the capability rows.
 *
 * Every row is implemented on iOS except the Wi-Fi card: iOS only exposes the
 * current SSID / nearby networks to apps with the Access WiFi Information or
 * Hotspot Configuration entitlement (a paid-account, reviewed capability), so
 * a normal app cannot scan or connect. The row stays `limited` and names that
 * limitation instead of pretending the buttons work.
 */
import type {CapabilityStatus} from './capabilities';

export type CapabilityStatusOverride = {
  status: CapabilityStatus;
  limitation?: string;
};

export const WIFI_NOTE =
  'iOS 不向普通应用提供附近 Wi-Fi 扫描或当前 SSID；本行在 iOS 上只说明这一平台限制，不能列出或连接 AP。';

export const BLUETOOTH_NOTE =
  '地址是平台提供的设备标识（Android 是设备 MAC，iOS 是系统分配的 UUID）；附近有一部分 BLE 广播不可连接，连接会等到超时。';

export const CAPABILITY_STATUS_OVERRIDES: Readonly<
  Record<string, CapabilityStatusOverride>
> = {
  clipboard: {status: 'available'},
  'wifi-network': {
    status: 'limited',
    limitation:
      'iOS 不允许普通应用扫描附近 Wi-Fi 或读取当前 SSID：需要 Access WiFi Information / Hotspot Configuration 配置权限（付费账号且需 Apple 审核）。本行在 iOS 上无法列出或连接 AP。',
  },
};

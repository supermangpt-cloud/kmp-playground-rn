/**
 * HarmonyOS profile for the capability rows.
 *
 * Everything is available except clipboard reads: the platform only grants
 * them through the system PasteButton, which the RNOH view tree has no binding
 * for, so the row stays `limited` and names the reason.
 */
import type {CapabilityStatus} from './capabilities';

export type CapabilityStatusOverride = {
  status: CapabilityStatus;
  limitation?: string;
};

export const WIFI_NOTE =
  '走 addCandidateConfig 候选网络路线；连接时系统会弹确认框，取消显示为「已取消」。当前 SSID 需要 GET_WIFI_INFO 权限，拿不到时会如实显示未知。';

export const BLUETOOTH_NOTE =
  '鸿蒙返回的地址是应用侧虚拟地址（没有 GET_BLUETOOTH_PEERS_MAC 时不是真实 MAC）；附近有一部分 BLE 广播不可连接，连接会等到超时。';

export const CAPABILITY_STATUS_OVERRIDES: Readonly<
  Record<string, CapabilityStatusOverride>
> = {
  clipboard: {
    status: 'limited',
    limitation:
      '写入可用；读回受系统限制：READ_PASTEBOARD 为 system_basic，普通应用无法申请，只能由系统 PasteButton 安全控件授权读取',
  },
};

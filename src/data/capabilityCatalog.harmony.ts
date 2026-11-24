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

export const CAPABILITY_STATUS_OVERRIDES: Readonly<
  Record<string, CapabilityStatusOverride>
> = {
  clipboard: {
    status: 'limited',
    limitation:
      '写入可用；读回受系统限制：READ_PASTEBOARD 为 system_basic，普通应用无法申请，只能由系统 PasteButton 安全控件授权读取',
  },
};

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

export const CAPABILITY_STATUS_OVERRIDES: Readonly<
  Record<string, CapabilityStatusOverride>
> = {
  clipboard: {status: 'available'},
  // These three ride libraries that are not linked into the iOS build yet. Their
  // podspecs (image-picker 7.0.3, async-storage 1.21.0) depend on `RCT-Folly`,
  // which React Native merged into `ReactNativeDependencies` in 0.76, so
  // `pod install` fails on them and they are excluded in `react-native.config.js`.
  // Marking them here keeps the page honest: before this, the rows claimed 可用
  // and only failed when tapped (「AsyncStorage 模块没有注册」).
  'local-storage': {
    status: 'unimplemented',
    limitation:
      'AsyncStorage 未链入 iOS 构建：@react-native-async-storage/async-storage 1.21.0 依赖 RN 0.76 已移除的 RCT-Folly，pod install 会失败，因此先在 iOS 排除。升级到 2.x 后可恢复。',
  },
  'image-pick': {
    status: 'unimplemented',
    limitation:
      'react-native-image-picker 7.0.3 同样依赖 RCT-Folly，iOS 暂未链入。升级到 8.x 后可恢复相册选图。',
  },
  'barcode-decode': {
    status: 'unimplemented',
    limitation:
      '二维码解析复用相册选图（image-picker），iOS 上随之一并不可用，升级 image-picker 后恢复。',
  },
  'wifi-network': {
    status: 'limited',
    limitation:
      'iOS 不允许普通应用扫描附近 Wi-Fi 或读取当前 SSID：需要 Access WiFi Information / Hotspot Configuration 配置权限（付费账号且需 Apple 审核）。本行在 iOS 上无法列出或连接 AP。',
  },
};

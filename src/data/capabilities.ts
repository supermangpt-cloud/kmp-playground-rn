/**
 * The 14 platform capabilities of the KMP build's `Capability.kt`
 * (`shared/src/commonMain/kotlin/com/example/kmp/platform/PlatformCapabilities.kt`)
 * and its `CapabilitiesScreen` rows.
 *
 * `title` and `detail` are copied verbatim from the KMP page (the KMP build
 * running on the HarmonyOS device, `com.example.kmp.harmony`), in the same order
 * the KMP page draws its cards: the `Directories` card sits second there even
 * though its enum value is last, and the acceptance check compares the two pages
 * side by side, so the visible order is the one that has to match.
 *
 * `status` is the RN port's own availability, not the KMP one (the KMP build
 * reports all 14 as 可用). The page only offers a button when the capability
 * really calls the platform, and an unavailable capability has to say so
 * instead of offering a button that does nothing: `unimplemented` rows print
 * `RN 版本暂未实现`.
 *
 * Seven rows are `available` now: local storage, the storage-directory card,
 * device information, network status, URL opening and the two image rows. The
 * clipboard is `limited`: writing works, but HarmonyOS only grants clipboard
 * reads to the system PasteButton. The directory card is interactive rather
 * than a single button (`action: 'directories'`), which the screen renders as
 * its own body.
 *
 * In particular 保存图片到相册 is `unimplemented`: the QR page has a 保存到相册
 * button, but that button only explains why the RN stack cannot write to the
 * album (see `docs/features/qrcode.md` §4). Labelling it partially available
 * would be exactly the "looks usable but is not" the ticket forbids.
 */
export type CapabilityStatus = 'available' | 'limited' | 'unimplemented';

/** What a row's button does; only rows that can call the platform have one. */
export type CapabilityAction =
  | 'pick-image'
  | 'decode-image'
  | 'local-storage'
  | 'open-url'
  | 'clipboard'
  | 'device-info'
  | 'network-status'
  | 'directories';

export type Capability = {
  /** Test id suffix and the key of the row's inline result. */
  id: string;
  title: string;
  detail: string;
  status: CapabilityStatus;
  action?: CapabilityAction;
  actionLabel?: string;
  /** Why a `limited` row is not fully available; shown inside the row. */
  limitation?: string;
};

/** The one-line reason an `unimplemented` row prints where its button would be. */
export const UNIMPLEMENTED_NOTE = 'RN 版本暂未实现';

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'local-storage',
    title: '本地存储',
    detail: 'SharedPreferences / NSUserDefaults / preferences',
    status: 'available',
    action: 'local-storage',
    actionLabel: '写 → 读 → 删 → 再读',
  },
  {
    id: 'directories',
    title: '存储目录',
    detail: '应用私有目录与公共目录的完整路径',
    status: 'available',
    action: 'directories',
  },
  {
    id: 'device-info',
    title: '设备信息',
    detail: '型号、系统名+版本、App 名+版本',
    status: 'available',
    action: 'device-info',
    actionLabel: '读取设备信息',
  },
  {
    id: 'network-status',
    title: '网络状态',
    detail: '是否联网 + 连接类型（wifi/cellular/ethernet）',
    status: 'available',
    action: 'network-status',
    actionLabel: '查询网络',
  },
  {
    id: 'haptics',
    title: '震动 / 触觉',
    detail: '轻 / 中 / 重三档',
    status: 'unimplemented',
  },
  {
    id: 'system-share',
    title: '系统分享',
    detail: '分享一段文本',
    status: 'unimplemented',
  },
  {
    id: 'url-opener',
    title: '打开外部链接',
    detail: '复用 isNavigableUrl，只放行 http(s)',
    status: 'available',
    action: 'open-url',
    actionLabel: '打开链接',
  },
  {
    id: 'clipboard',
    title: '剪贴板',
    detail: '写入后读回（粘贴由输入法验证）',
    status: 'limited',
    action: 'clipboard',
    actionLabel: '写入 → 读回',
    limitation:
      '写入可用；读回受系统限制：READ_PASTEBOARD 为 system_basic，普通应用无法申请，只能由系统 PasteButton 安全控件授权读取',
  },
  {
    id: 'camera-permission',
    title: '动态权限',
    detail: '8 个常用权限，每行可查询、申请，拒绝后有兜底',
    status: 'unimplemented',
  },
  {
    id: 'bluetooth-le',
    title: '蓝牙 LE',
    detail: '扫描附近设备，连接 / 断开',
    status: 'unimplemented',
  },
  {
    id: 'wifi-network',
    title: 'WiFi',
    detail: '扫描附近 AP（SSID + RSSI + 加密），连接',
    status: 'unimplemented',
  },
  {
    id: 'image-save',
    title: '保存图片到相册',
    detail: '生成二维码 PNG 并写入系统相册',
    status: 'unimplemented',
  },
  {
    id: 'image-pick',
    title: '从相册选图',
    detail: '系统照片选择器，零相册权限',
    status: 'available',
    action: 'pick-image',
    actionLabel: '选一张图',
  },
  {
    id: 'barcode-decode',
    title: '图片解析二维码',
    detail: '选一张带码的图并识别，零权限',
    status: 'available',
    action: 'decode-image',
    actionLabel: '选图并解析',
  },
];

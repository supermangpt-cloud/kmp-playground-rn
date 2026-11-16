# 平台能力页（骨架）

这一单把首屏「平台能力」入口补上了页面：14 项能力的列表，顺序、中文名和说明文字
与 KMP 版一致。**只做骨架**——除扫码页已经实现的两项外，其余能力在页面上明确标
「未实现」，不提供「点了没反应」的按钮，也没有为填满 14 行新增任何依赖。

## 页面结构

| 文件 | 内容 |
| --- | --- |
| `src/data/capabilities.ts` | 14 项的静态定义（`id` / `title` / `detail` / `status`，可用项带 `action` 和 `actionLabel`） |
| `src/screens/CapabilitiesScreen.tsx` | 头部（返回、`共 14 项`）、标题/副标题、`ScrollView` 里的 14 张卡片；可用项在行内调用系统 API 并显示结果 |
| `App.tsx` | `Screen` 增加 `{kind: 'capabilities'}`，首屏 `平台能力` 进入、`返回` 回列表 |
| `src/screens/ProductListScreen.tsx` | `onOpenCapabilities` 由可选改为必填，入口真正接上 |

卡片结构照抄 KMP 的 `CapabilityCard`：能力名（17 bold）与说明（11 hint）在左，
右上角是状态标签；可用项下面是一行操作按钮，结果再往下显示在行内。

## 14 项对照表

KMP 状态取自真机（`com.example.kmp.harmony`）的能力页 dump，14 行全部是「可用」。

| # | `Capability.kt` 枚举 | KMP 页面标题 | 说明文字 | KMP 状态 | RN 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `LocalStorage` | 本地存储 | `SharedPreferences / NSUserDefaults / preferences` | 可用 | 未实现 |
| 2 | `Directories` | 存储目录 | `应用私有目录与公共目录的完整路径` | 可用 | 未实现 |
| 3 | `DeviceInfo` | 设备信息 | `型号、系统名+版本、App 名+版本` | 可用 | 未实现 |
| 4 | `NetworkStatus` | 网络状态 | `是否联网 + 连接类型（wifi/cellular/ethernet）` | 可用 | 未实现 |
| 5 | `Haptics` | 震动 / 触觉 | `轻 / 中 / 重三档` | 可用 | 未实现 |
| 6 | `SystemShare` | 系统分享 | `分享一段文本` | 可用 | 未实现 |
| 7 | `UrlOpener` | 打开外部链接 | `复用 isNavigableUrl，只放行 http(s)` | 可用 | 未实现 |
| 8 | `Clipboard` | 剪贴板 | `写入后读回（粘贴由输入法验证）` | 可用 | 未实现 |
| 9 | `CameraPermission` | 动态权限 | `8 个常用权限，每行可查询、申请，拒绝后有兜底` | 可用 | 未实现 |
| 10 | `BluetoothLe` | 蓝牙 LE | `扫描附近设备，连接 / 断开` | 可用 | 未实现 |
| 11 | `WifiNetwork` | WiFi | `扫描附近 AP（SSID + RSSI + 加密），连接` | 可用 | 未实现 |
| 12 | `ImageSave` | 保存图片到相册 | `生成二维码 PNG 并写入系统相册` | 可用 | 未实现 |
| 13 | `ImagePick` | 从相册选图 | `系统照片选择器，零相册权限` | 可用 | **可用** |
| 14 | `BarcodeDecode` | 图片解析二维码 | `选一张带码的图并识别，零权限` | 可用 | **可用** |

### 与 issue 表格的三处差异（都以真机为准）

1. **顺序**：`Directories` 在 `Capability.kt` 的枚举里是最后一项，但 KMP 能力页把它
   画在**第 2 张卡**。验收是两版页面并排对比，所以 RN 也放第 2 位。
2. **标题**：`CameraPermission` 的页面标题是「动态权限」（不是「相机权限」），
   `BarcodeDecode` 是「图片解析二维码」（不是「图片扫码」）。KMP 页面的
   `CapabilityRow` 覆盖了枚举里更短的名字。
3. **`ImageSave` 的 RN 状态是「未实现」**：issue 假设它「目前在二维码页里可用」，但
   二维码页的「保存到相册」只会显示不可用原因——RNOH 0.72.140 上 camera-roll 适配包
   编译不过，也没有把 PNG 写进沙箱的文件能力（见
   [qrcode.md](qrcode.md) §4）。因此这里不能写「部分可用／二维码页可用」，否则正好
   是这一单禁止的「假装能点」。

## 状态规则

| RN 状态 | 标签 | 标签样式 | 行内操作区 |
| --- | --- | --- | --- |
| 已实现 | `可用` | 绿色（`#2E7D32`）细边框 | 一个橙色按钮，调用真实 API，结果显示在按钮下方 |
| 未实现 | `未实现` | 灰色（`#9E9E9E`）细边框 | **没有按钮**，灰色文字 `RN 版本暂未实现` |

「没有按钮」是刻意的：比一个看起来能点、点了没反应的按钮更符合要求，也避免出现
「禁用按钮」被误解成权限问题。

## 两个可用项的具体路径

- **从相册选图**（`image-pick`）：`src/native/imagePicker.ts` 的
  `launchImageLibrary`（鸿蒙 `PhotoViewPicker`，零相册权限），行内显示
  `已选择：文件名 · MIME · 字节数`；取消显示 `已取消选图`。
- **图片解析二维码**（`barcode-decode`）：同一个选图入口，优先
  `src/native/scanKit.ts` 的原生 Scan Kit 解码；模块不存在时退回
  `src/qr/imageDecode.ts` 的纯 JS `jsqr`。行内显示
  `解析到 N 个：内容`，失败显示平台给的原因（不是静默失败）。

这两项都只是复用扫码页已有的模块，**没有新增依赖**；在其他平台（Android/iOS）上
模块不存在时，点按钮会在行内显示「失败：ImagePicker 模块没有注册……」这类明确原因。
状态标签本身是静态的（与 `src/data/capabilities.ts` 一致），因为本工程的鸿蒙版是
这两个适配的主目标平台。

## 验证

- `npx tsc --noEmit`：通过。
- `npx jest`：10 个测试文件、57 个用例通过。新增
  `__tests__/capabilitiesScreen.test.tsx` 覆盖 14 行的顺序与标题、状态标签、
  未实现行没有按钮、选图/解码的调用与行内结果、模块缺失时报错、返回回调；
  `__tests__/App.test.tsx` 覆盖首屏进入能力页再返回。
- 真机（HarmonyOS，1260×2720）：安装 RN HAP 后从首屏「平台能力」进入本页，
  `uitest dumpLayout` 核对 14 行标题/说明/顺序与 KMP 一致，`返回` 回列表。
- 「从相册选图」真机点按会拉起系统照片选择器（界面显示「仅可访问所选图片」，
  即零相册权限），取消后行内显示 `已取消选图`；两条可用项在页面底部的状态
  （`可用` + 按钮）见 `docs/evidence/ui-parity/capabilities-available-rows.jpg`。
- 与 KMP 版能力页并排的证据：`docs/evidence/ui-parity/capabilities.png`
  （左：KMP 参考实现，基线；右：本单 RN 构建，同一台设备、浅色主题、页面顶部
  同一滚动位置）。KMP 的行更高，因为它的每一行都有一个可点的操作按钮；RN 骨架
  里未实现的行用一行灰字代替按钮，这是两边唯一的结构差异。

## 后续

其余 12 项需要各自的平台能力，按 KMP 的 `PlatformCapabilities` 接口逐项移植
（本地存储、目录、设备信息、网络、震动、分享、外链、剪贴板、动态权限、
BLE、WiFi、相册写入）。在实现之前，本页保持「未实现」并在
`src/data/capabilities.ts` 里改一行 `status` 即可点亮对应行。

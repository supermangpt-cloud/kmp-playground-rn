# 平台能力页

能力页从骨架推进到六批鸿蒙能力，第七批把同样的 14 行接到 Android / iOS。
14 行的名称、说明、顺序仍与 KMP 版（`CapabilitiesScreen.kt` 真机 dump）一致；
页面结构也还是 KMP 的 `名称 + 说明 + 右上状态 + 下方操作按钮 + 行内结果`。

状态先按鸿蒙写（Android / iOS 的覆盖在 `capabilityCatalog.*`）：

- **可用**（13 行）：本地存储、存储目录、设备信息、网络状态、震动/触觉、
  系统分享、打开外部链接、动态权限、蓝牙 LE、WiFi、保存图片到相册、从相册选图、
  图片解析二维码。
- **部分可用**（1 行）：剪贴板。写入可用，读取被鸿蒙的系统权限限制，行内写明原因。
- **未实现**（0 行）：14 行都能点，没有「未实现」占位。

平台差异：Android 上剪贴板也变成「可用」；iOS 上 WiFi 是「部分可用」
（没有 Apple 的 WiFi/Hotspot entitlement，普通应用不能扫描附近 AP），
其余 13 行可用。详见「第七批：Android / iOS」。

首屏、购物车、扫码页的现有对齐没有改动。

## 页面结构

| 文件 | 内容 |
| --- | --- |
| `src/data/capabilities.ts` | 14 项的静态定义（`id` / `title` / `detail` / `status` / `action` / `actionLabel` / `limitation`） |
| `src/screens/CapabilitiesScreen.tsx` | 头部、标题/副标题、`ScrollView` 里的 14 张卡片；每个可用项在行内调用真实 API 并显示结果 |
| `src/native/urlOpener.ts` | `isNavigableUrl` 守卫 + `Linking.openURL` |
| `src/native/asyncStorage.ts` | HarmonyOS `RNCAsyncStorage` turbo module 的 JS 封装（写 / 读 / 删） |
| `src/native/clipboard.ts` | HarmonyOS `RNCClipboard` turbo module 的 JS 封装（写 / 读） |
| `src/native/deviceInfo.ts` | `CapabilityProbe` 的 `readDeviceInfo` 封装与返回校验 |
| `src/native/networkStatus.ts` | `CapabilityProbe` 的 `readNetworkStatus` 封装；`unknown` 不猜成某类 |
| `src/native/storageDirectories.ts` | `CapabilityProbe` 的 `readDirectories` 封装 + 7 行的静态 note 映射 |
| `src/native/haptics.ts` | `CapabilityProbe` 的 `vibrateHaptic` 封装（返回回退说明） |
| `src/native/systemShare.ts` | `CapabilityProbe` 的 `shareText` 封装 + 分享文本 |
| `src/native/permissions.ts` | 8 个权限的定义、四态文案、`CapabilityProbe` 的三个权限方法封装；保存到相册的 `去设置` 也复用这里的 `openPermissionSettings` |
| `src/native/imageSave.ts` | `ImageSave` turbo module 的 JS 封装：结构化结果、模块缺失说明、`qrSaveTitle` |
| `src/native/wifiNetwork.ts` | `WifiNetwork` turbo module 的 JS 封装：扫描 / 当前 SSID / 候选网络连接的载荷校验与失败原因 |
| `src/qr/qrPng.ts` | 把二维码矩阵编码成灰度 PNG（含 4 模块静区，PNG/CRC/Adler-32 全在 JS 里） |
| `src/data/directories.ts` | 7 个目录的中文标签（与 KMP 的 `DirectoryKind.label` 一致） |
| `harmony/entry/oh-package.json5` | 新增 async-storage、clipboard 两个 har 依赖（前一批） |
| `harmony/entry/src/main/cpp/PackageProvider.cpp` | 注册两个包的 C++ method map（CAPI 架构） |
| `harmony/entry/src/main/ets/PackageProvider.ets` | 注册两个包的 ArkTS turbo module，以及本单的 `CapabilityProbePackage` 和 `ImageSavePackage` |
| `harmony/entry/src/main/ets/capabilities/CapabilityProbeTurboModule.ets` | `@ohos.deviceInfo` / `@ohos.net.connection` / `Context` + `@ohos.file.fs` 的真实读取，以及 `@ohos.vibrator`、ShareKit、`@ohos.abilityAccessCtrl` 的调用 |
| `harmony/entry/src/main/ets/image/ImageSaveTurboModule.ets` | `WRITE_IMAGEVIDEO` 申请 → 缓存 PNG → `photoAccessHelper.createAsset` → 写入并读回校验 |
| `harmony/entry/src/main/ets/wifi/WifiNetworkTurboModule.ets` | `@ohos.wifiManager` 的扫描 / 当前 SSID / `addCandidateConfig` + `connectToCandidateConfigWithUserAction` 连接 |
| `harmony/entry/src/main/cpp/ImageSaveTurboModule.h` | `ImageSave` 的 `saveImage` C++ method map |
| `harmony/entry/src/main/cpp/WifiNetworkTurboModule.h` | `WifiNetwork` 三个 Promise 方法的 C++ method map |
| `harmony/entry/src/main/cpp/CapabilityProbeTurboModule.h` | `CapabilityProbe` 八个 Promise 方法的 C++ method map |
| `harmony/entry/src/main/module.json5` | `GET_NETWORK_INFO`、两个公共目录、`VIBRATE`、四个动态权限、`WRITE_IMAGEVIDEO`、`GET_WIFI_INFO` / `SET_WIFI_INFO` 的声明 |

## 状态规则

| RN 状态 | 标签 | 样式 | 行内操作区 |
| --- | --- | --- | --- |
| `available` | `可用` | 绿色（`#2E7D32`）细边框 | 一个橙色按钮，调用真实 API，结果显示在按钮下方 |
| `limited` | `部分可用` | 橙色（`#EF6C00`）细边框 | 按钮照常可用，另有一行橙色限制说明 |
| `unimplemented` | `未实现` | 灰色（`#9E9E9E`）细边框 | **没有按钮**，灰色文字 `RN 版本暂未实现` |

「没有按钮」和骨架时一样是刻意的：比一个看起来能点、点了没反应的按钮更符合要求。
`limited` 是这一单为剪贴板新增的状态（见下文「为什么剪贴板不是『可用』」）。

## 第一批三项能力

### 1. 本地存储（`local-storage`）

- 按钮文案：`写 → 读 → 删 → 再读`（与 KMP 一致）。
- 一次点击依次调用 `@react-native-oh-tpl/async-storage` 的
  `multiSet` → `multiGet` → `multiRemove` → `multiGet`；key 用 KMP 的
  `platform_capabilities.demo_key`，值形如 `rn-demo-2051`。
- 结果只写在行内，格式与 KMP 相同：
  `写入「rn-demo-2051」→ 读回「rn-demo-2051」→ 删除 → 再读「null」`。
- 真机（HUAWEI Mate 60 Pro，HarmonyOS）实测通过，见
  [after-capabilities-top.png](../evidence/capabilities/after-capabilities-top.png)。

### 2. 打开外部链接（`url-opener`）

- 按钮文案：`打开链接`；演示 URL `https://example.com`（与 KMP 相同）。
- 先复用 `src/ui/webUrl.ts` 的 `isNavigableUrl`（KMP `GuardedUrlOpener` 的
  RN 对应），只放行 http/https；其他 scheme 在任何平台调用之前就被拒绝，并回显
  `只允许打开 http/https 链接：…`。
- 通过 RN 内置 `Linking.openURL` 拉起系统浏览器；成功回显
  `已交给系统浏览器：https://example.com`。
- 真机实测：点按后前台切到 `com.huawei.hmos.browser`，返回 App 后行内显示上面的回显
  （浏览器截图 [after-url-browser.png](../evidence/capabilities/after-url-browser.png)）。

### 3. 剪贴板（`clipboard`）

- 按钮文案：`写入 → 读回`；写入值形如 `RN 剪贴板演示 5371`。
- 先写，再尝试读回。**鸿蒙上写入成功、读取失败**：
  - `ohos.permission.READ_PASTEBOARD` 是 `user_grant` 但 `availableLevel: system_basic`，
    普通应用无法持有；`@react-native-oh-tpl/clipboard` 的 ArkTS 模块在运行时申请失败后
    reject `User refuses authorization`。
  - `devecocli device clipboard read` 能读到刚写入的 `RN 剪贴板演示 5371`，证明写入
    确实落到了系统剪贴板；App 内的读回则被系统拒绝。
  - 页面回显：`写入「RN 剪贴板演示 5371」成功；读回失败：User refuses authorization（读取需要系统 PasteButton 安全控件授权）`。
- **状态标为 `部分可用`，不是 `可用`**：
  - KMP 版能在 Compose 里嵌入系统 `PasteButton`，靠用户点击控件拿到一次性读取授权，
    所以 KMP 显示「可用」。
  - RNOH 0.72 的 RN 视图里没有嵌入 ArkTS 安全控件的通路的现成适配；本单没有为
    「一个按钮」新增 CAPI 自定义组件，因此 RN 版读回确实不可用。
  - 按「没实现完的能力不许虚标」的硬约束，这里用 `limited`：
    写入是真实可用的，读取的限制在行内明写，而不是标成完全可用或静默失败。
- 真机结果见
  [after-capabilities-url-clipboard.png](../evidence/capabilities/after-capabilities-url-clipboard.png)。


## 第二批三项能力

本批把 `存储目录`、`设备信息`、`网络状态` 三行从「未实现」变成真实读取。三项共用
App 自己的 ArkTS turbo module `CapabilityProbe`：`@ohos.*` 只能在 ArkTS 侧调用，
JS 只负责格式化和显示。

### 4. 设备信息（`device-info`）

- 按钮：`读取设备信息`；每次点击重新读，不在 JS 里缓存。
- ArkTS 读取 `deviceInfo.productModel`、`deviceInfo.displayVersion`（去掉型号前缀）、
  `bundleManager.getBundleInfoForSelfSync().versionName`；App 名用
  `resourceManager.getStringSync(applicationInfo.labelId)` 解析。
- 行内格式与 KMP 相同：`型号 · 系统名 系统版本 · App 名 App 版本`。
- 真机（HUAWEI Mate 60 Pro / API 26）实测：
  `ALN-AL00 · HarmonyOS 7.0.0.111(SP10C00E111R4P3) · KMP RN Demo 1.0.0`，
  型号和系统版本可与系统设置逐字核对，不是示例值。

### 5. 网络状态（`network-status`）

- 按钮：`查询网络`；**每次点击都重新调用** `@ohos.net.connection` 的
  `getDefaultNetSync` / `getNetCapabilitiesSync`，没有任何缓存。
- 承载类型按 wifi → cellular → ethernet 判定（与 KMP 相同）；默认网络存在但
  不属于这三类时显示 `已联网 · 未知`，不猜成 wifi/cellular。
- 真机实测：Wi-Fi 开着 → `已联网 · wifi`；从控制中心关掉 Wi-Fi 再点 →
  `未联网 · none`；重新打开 Wi-Fi 再点 → `已联网 · wifi`。
- 权限：`ohos.permission.GET_NETWORK_INFO`（`system_grant` + `normal`），
  安装即授予。漏声明时平台会拒绝读取，行内显示 `读取失败：Permission denied`。

### 6. 存储目录（`directories`）

- 打开页面自动读取（不申请权限）：`共 7 项` + `刷新`，每行
  `名称 / 存在（或 不存在）/ 复制 / 真实路径`。
- 7 项来源：缓存 `context.cacheDir`、文件 `context.filesDir`、数据库
  `context.databaseDir`、临时 `context.tempDir`、下载
  `Environment.getUserDownloadDir()`、文档 `Environment.getUserDocumentDir()`、
  相册（没有目录路径）。
- `exists` 是读取时对路径调用 `fs.accessSync` 的真实探测，不是写死 true。
  没有路径的行不显示「复制」，而是在路径位置显示说明。
- 手机上的公共下载/文档目录返回 `801`，行内显示
  `当前设备类型不支持公共下载目录（801：仅 PC/2in1 与平板支持）`（文档目录同理），
  **不编造路径**；相册行显示 `photoAccessHelper` 的 URI 说明。
- 只有显式点「刷新」才申请
  `READ_WRITE_DOWNLOAD_DIRECTORY` / `READ_WRITE_DOCUMENTS_DIRECTORY`
  （`user_grant` + `normal`，`module.json5` 里带 `reason` / `usedScene`）；
  打开页面不会弹权限框。
- 复制：点行内「复制」写系统剪贴板并显示「已复制」；用
  `devecocli device clipboard read` 读回的内容与路径完全一致。
- 真机实测：4 个应用私有目录都显示 `存在`；公共下载/文档都是 801 说明；
  相册是 null + photoAccessHelper 说明；「刷新」后仍为 `共 7 项`、无崩溃。

### 为什么没有引入 issue 列出的三个 RN 适配包

issue 的依赖列了 `@react-native-oh-tpl/react-native-fs` /
`react-native-device-info` / `react-native-network-info` 三个鸿蒙适配版。核对它们
的 HarmonyOS 实现后本单没有使用：

- `device-info` 的 `getSystemVersion()` 返回 `deviceInfo.osReleaseType`（`Release`），
  不是规格要求的系统版本串；要得到 `7.0.0.111(...)` 仍然得读 `displayVersion`。
- `network-info` 只有 SSID / BSSID / IP，没有「当前是否联网 + 承载类型」；规格明确
  要求用 `@ohos.net.connection` 判断类型。
- `fs` 提供文件 API 和部分目录常量，但公共下载/文档目录的 801 与权限说明、相册
  没有路径的语义、以及本页 7 行的 note 映射仍然要自己写。

这三项本来就是 KMP ArkTS 能力的直接移植；RNOH 已有 App 自己的 ArkTS turbo module
通路（`ScanKit`），因此新增一个 `CapabilityProbe` 模块复用 KMP 已验证的 ArkTS 逻辑，
比再手工接三个 har + 三个 C++ method map 更小、更容易核对真值。以后需要这些包的
其它能力时，再按现有手工接入方式单独添加。

## HarmonyOS 依赖怎么接的

前一批的两个包按之前 WebView / svg / image-picker 的手工接入方式（本工程没有
RNOH autolinking）：

1. `npm install` 固定版本：`@react-native-oh-tpl/async-storage@1.21.0-0.2.2`、
   `@react-native-oh-tpl/clipboard@1.13.2-0.0.9`（package.json 里不带 `^`）。
2. `harmony/entry/oh-package.json5` 用 `file:../../node_modules/.../harmony/*.har`
   引入 har。
3. `CMakeLists.txt` `add_subdirectory` 两个包的 `src/main/cpp` 并链接
   `rnoh_async_storage` / `rnoh_clipboard`。
4. `PackageProvider.cpp` 注册 `AsyncStoragePackage` / `ClipboardPackage`
   （CAPI 架构下提供 `RNCAsyncStorage` / `RNCClipboard` 的 method map）。
5. `PackageProvider.ets` 注册两个包的 ArkTS turbo module。

JS 侧没有直接 import 包的 JS 入口，而是像 `imagePicker.ts` 一样通过
`global.__turboModuleProxy` 取 `RNCAsyncStorage` / `RNCClipboard`：RN 0.72 的
`TurboModuleRegistry` 会先查 legacy `NativeModules` 表，RNOH 对每个名字都返回空
stub，直接走 proxy 才能拿到 `PackageProvider.ets` 注册的模块。README 里有说明，
`src/native/asyncStorage.ts` 和 `src/native/clipboard.ts` 的注释也记录了原因。

本单的 `CapabilityProbe` 是 App 自己的模块，接入方式与 `ScanKit` 相同：
`CapabilityProbePackage.ets` 在 `PackageProvider.ets` 注册 ArkTS 实现，
`CapabilityProbeTurboModule.h` 在 `PackageProvider.cpp` 的 `AppPackage` 里补
C++ method map，JS 侧通过 `src/native/turboModule.ts` 的 proxy 取模块。

## 验证

- `npx tsc --noEmit`：通过。
- `npx eslint src __tests__`：通过（0 error / 0 warning）。
- `npx jest`：16 个测试文件、91 个用例通过。本单新增：
  - `__tests__/deviceInfo.test.ts`：真实五字段映射、模块未注册、字段不完整、
    原生拒绝转成行内原因。
  - `__tests__/networkStatus.test.ts`：每次重新读（wifi → none）、`unknown` 不猜、
    矛盾/不完整 payload 拒绝、模块未注册。
  - `__tests__/storageDirectories.test.ts`：7 行映射、空串路径转 null、801/201
    运行时 note 优先、公共目录静态 note、相册 photoAccessHelper 说明、未知 kind 拒绝。
  - `__tests__/capabilitiesScreen.test.tsx`：14 行顺序、目录卡 7 行与真实路径、
    首读不申请权限 / 刷新申请权限、复制回显、设备信息与网络状态行内回显、
    网络关闭后再查为 none。
- 真机（1260×2720，浅色主题）：按作者要求的 设备信息 → 网络状态 → 存储目录
  顺序，每项单独构建、安装、验证。基线是本单开始前的 `main`（`f5abca0`）HAP；
  改后是每个 commit 的 HAP。
  - 设备信息：行内显示
    `ALN-AL00 · HarmonyOS 7.0.0.111(SP10C00E111R4P3) · KMP RN Demo 1.0.0`。
  - 网络状态：Wi-Fi 开 → `已联网 · wifi`；关 Wi-Fi → `未联网 · none`；
    重开 → `已联网 · wifi`。
  - 存储目录：`共 7 项`，4 个私有目录路径真实且 `存在`，公共下载/文档 801，
    相册 null + photoAccessHelper 说明；「复制」后系统剪贴板读回路径一致。
  - 证据在 `docs/evidence/capabilities/next-three/`：`before-rows.png` 是
    `main` 上三行「未实现」的基线；`after-device-network.png` / `after-network-none.png`
    是设备信息与网络状态（联网/断网）；`after-directories-top.png` /
    `after-directories-copied.png` / `after-directories-bottom.png` 是目录卡。

## 第三批三项能力（震动 / 系统分享 / 动态权限）

本批把 `震动 / 触觉`、`系统分享`、`动态权限` 三行从「未实现」变成真实调用。三项都走
App 自己的 ArkTS `CapabilityProbe` 模块（与第二批同一通路），没有再引入新的 npm/har
依赖；原因见本节末尾「为什么没有直接用 issue 列的三个 RN 适配包」。

### 7. 震动 / 触觉（`haptics`）

- 三个按钮横排（轻 / 中 / 重），没有单独的查询按钮，与 KMP 真机 dump 一致。
- ArkTS 侧 `vibrateHaptic(strength)`：
  1. `getVibratorInfoSync()` 查马达；没有马达 → reject
     `该设备没有振动马达，无法触发震动`，页面显示原因而不是静默。
  2. 三档是 15 / 40 / 80 ms 的 `VibrateTime`，先 `usage: 'physicalFeedback'`。
  3. 被系统开关忽略时（页面实测错误码 `14600101`，hilog
     `ShouldIgnoreVibrate … ret:9`）用 `usage: 'notification'` 重试一次，并返回
     `物理反馈被系统触感开关忽略，已用通知场景振动代替`，行内原样显示。
  4. 重试也失败 → reject 带两个 code/message，页面显示失败原因，不假装成功。
- 真机（这台机器的触感开关是关的）：轻 / 中 / 重都显示
  `已触发轻/中/重震动（物理反馈被系统触感开关忽略，已用通知场景振动代替）`。
  hilog 里每次都是 `physicalFeedback` 先被 `ShouldIgnoreVibrate ret:9` 忽略，紧接着
  `usage:3 duration:15`（轻）启动马达，HAL 打印
  `StartByIntensity: haptic.time_25, support = 1 amp = 100` —— 马达确实转了。
  所以本机不会出现「点了没反应还不知道为什么」。

### 8. 系统分享（`system-share`）

- 按钮「分享文本」，内容 `来自 KMP 平台能力演示的分享文本`（与 KMP 相同）。
- ArkTS：先 `canIUse('SystemCapability.Collaboration.SystemShare')`，不可用则报
  `当前设备不支持系统分享（…不可用）`；可用时
  `systemShare.SharedData({utd: 'general.plain-text'})` +
  `ShareController.show(context, {previewMode: DETAIL, selectionMode: SINGLE})`。
- 与三端约定一致：promise resolve 只表示**面板已拉起**，不表示用户选了目标
  （平台不回传）。真机拉起的是华为分享面板（华为分享 / 微信 / 备忘录 / QQ浏览器 /
  蓝牙 / 复制 / 打印 / 添加至中转站…），行内显示
  `已拉起系统分享面板（内容：…）`。

### 9. 动态权限（`camera-permission`）

- 8 行：相机 / 麦克风 / 位置 / 通知 / 日历 / 蓝牙 / 相册 / 通讯录（KMP 顺序）。
  每行是 `状态 chip + 查询 + 申请 + 该状态的建议文案`，被拒绝后多一个 `去设置`。
- 三态：`granted / denied / notDetermined`。鸿蒙没有「永久拒绝」，
  `checkAccessTokenSync` 也只回答 granted / not；ArkTS 在
  `requestPermissionsFromUser` **之前**把「问过一次」写进 preferences
  （`permission_requested_<id>`），查询时才能区分 `未询问` 和 `已拒绝`。
- 位置：`LOCATION` + `APPROXIMATELY_LOCATION`；任一已授权即视为 Granted，申请时
  任一返回 0 即 Granted（用户可以只给模糊位置）。
- 通知不是权限：走 `notificationManager.isNotificationEnabledSync` /
  `requestEnableNotification` / `openNotificationSettings`。
- 相册 / 通讯录：`READ_IMAGEVIDEO` / `READ_CONTACTS` 是 `system_basic` 的 ACL
  受限权限，普通场景申请不到；行内显示「不可用：…」并给出官方 Picker 替代，
  **没有查询/申请按钮**。
- `去设置` 不是死路也不是裸 `startAbility`：普通权限用
  `requestPermissionOnSetting`（官方二次申请路径），通知用
  `openNotificationSettings`。
- `authResults` 只接受 0 / -1；其他值（例如 2 = 权限没在 `module.json5` 声明）
  作为失败显示，不假装是用户拒绝。
- 真机验收（重装后从零开始）：
  - 8 行都在；相机查询 `未询问` → 申请弹系统相机框 → 不允许 → `已拒绝`，
    同时出现 `去设置` 和建议文案；
  - 点 `去设置` 弹出「相机权限」设置页（允许 / 不允许 / 确定）；返回后行内提示
    `已打开系统设置页；回到 App 后点「查询」刷新状态`；再查询仍是 `已拒绝`
    （asked 标记生效，没有退回 `未询问`）；
  - 通知同样能申请、拒绝（`已拒绝` + `去设置`），点开的是「通知管理」页；
  - 麦克风 / 位置 / 日历 / 蓝牙查询都是 `未询问`（真实系统状态，不是占位）；
  - 相册 / 通讯录显示完整 ACL 说明，且没有按钮。

### 验收证据

截图在 `docs/evidence/capabilities/haptics-share-permissions/`；基线是 `main`
（`e6eb3c8`）的 HAP，改后是同一台机器、同一浅色主题下的 HAP：

| 场景 | 基线（before） | 改后（after） |
| --- | --- | --- |
| 震动 + 系统分享 | `before-haptics-share.png` 两行「未实现」 | `after-haptics-light.png`、`after-haptics-heavy.png` 三按钮 + 回退说明 |
| 系统分享面板 | —（没有按钮） | `after-share-panel.png` 华为分享面板 + 行内回显 |
| 动态权限卡片 | `before-permissions.png`「未实现」 | `after-permissions-top.png` 说明 + 8 行；`after-permissions-queried-states.png` 六个可申请行的真实状态 |
| 权限查询 / 申请 / 拒绝 | — | `after-permission-queried.png`、`after-permission-dialog.png`、`after-permission-denied.png` |
| 去设置（不是死路） | — | `after-permission-settings.png` 相机权限设置页、`after-permission-settings-return.png` 返回提示 |
| 通知的申请 / 拒绝 / 去设置 | — | `after-notification-denied.png`、`after-notification-settings.png` 通知管理页 |
| 相册 / 通讯录 ACL | — | `after-permissions-acl.png` 不可用说明，无按钮 |

### 为什么没有直接用 issue 列的三个 RN 适配包

issue 列了 `@react-native-oh-tpl/react-native-haptic-feedback@2.2.0-0.0.1`、
`react-native-share@10.2.1-0.0.6`、`react-native-permissions@4.1.2-0.1.7`。
核对它们的 HarmonyOS 实现后，本单没有引入：

- **haptic-feedback** 的 ArkTS `trigger()` 返回 void，内部直接 `return` 吞掉
  「静音 / 振动模式关闭」的情况，也没有马达查询和每次调用的结果。页面无法知道
  是否真的振了，正好违反本单「不要静默失败、开关关着要说明原因」的硬要求；
  KMP 已验证的「马达查询 → physicalFeedback → notification 重试 → 回退说明」
  只能自己写。
- **share** 的 HarmonyOS `open()` 走 `GenericShare.openSingleWant`（want 分享），
  还要引入它自己的 `RNShareAbility` 与页面；本页只需要 ShareKit 的
  `SystemShare` 面板，20 行 ArkTS 就够，且与 KMP 实现一致。
- **permissions** 的 `check()` 没有 `notDetermined`（鸿蒙查不到「未问过」），
  `openSettings()` 打开的是设置应用首页而不是该权限的设置页；要满足本单的
  「第三态 + 去设置」仍得自己维护 asked 标记并调用 `requestPermissionOnSetting`。
  它本身也是 ArkTS turbo module + C++ method map，接入量和直接加到
  `CapabilityProbe` 相同。

（第二批的 async-storage / clipboard 确实用了 issue 列的适配包；这一批是三个包
都不满足规格，才没有用。）


## 第四批：蓝牙 LE（`bluetooth-le`）

本批把 `蓝牙 LE` 从「未实现」变成真实扫描 / 连接。只引入了 issue 指定的适配包
`@react-native-oh-tpl/react-native-ble-plx@3.2.0-0.0.3`（`npm install --save-exact`），
没有新增别的依赖，也没有自己写原生模块。

### 10. 蓝牙 LE（`bluetooth-le`）

- 行内结构：`扫描 / 停止` + 已发现台数，一行说明两个平台特性，下面是可滚动的设备列表，
  每行 `设备名 / 虚拟地址 · RSSI` + `连接`（连上后变 `断开`）。
- 权限：点「扫描」先用上一批的 `src/native/permissions.ts` 申请
  `ohos.permission.ACCESS_BLUETOOTH`（`user_grant`，`module.json5` 已带
  `reason` / `usedScene`）；被拒绝时行内显示「没有蓝牙权限：请到上方「动态权限」卡片的
  蓝牙行点「去设置」打开后重试」，不会假装扫到 0 台。`APPROXIMATELY_LOCATION` 也在
  `module.json5` 里（上一批为位置行声明）；Connectivity Kit 的「查找设备」指南写明
  BLE 扫描只需要 `ACCESS_BLUETOOTH`，本页按此申请，没有额外弹位置权限。
- 扫描：`BlePlx.startDeviceScan(null, {scanMode: 2})`，监听 `ScanEvent`；JS 侧按
  `deviceId` 去重、按 RSSI 排序、每 400ms 合并一次再交给页面，避免每条广播都触发渲染。
  列表按固定行高 48vp 做窗口化：只挂载可视窗口 + 余量（≤24 行），用上下占位 `View`
  维持滚动高度，因此扫到几百台时也不会一次渲染几百行。
- 连接：`connectToDevice(deviceId)`。ArkTS 侧只在 `STATE_CONNECTED` 时 resolve，
  所以 JS 侧加了 15 秒超时（`CONNECT_TIMEOUT_MS`）；超时后若平台迟到的连接真的成功，
  会再断开它，不让页面报失败却留着一个连接。失败按 `errorCode` / 平台 reason 分类成
  超时 / 拒绝 / 无权限 / 未知，行内显示具体原因，不是一句「失败」。
- 真实地址：没有 `GET_BLUETOOTH_PEERS_MAC`（`system_basic`）时 `ScanResult.deviceId`
  是应用侧虚拟地址。卡片第一行说明写明「不是真实 MAC」，地址行按原样显示，不假装成 MAC。
- 蓝牙关闭：点「扫描」先读平台状态，`PoweredOff` 时清空结果并显示
  `蓝牙已关闭，请先打开系统蓝牙再扫描`，不会显示成「附近没有设备」。

#### 依赖怎么接的

1. `package.json` 固定 `@react-native-oh-tpl/react-native-ble-plx: 3.2.0-0.0.3`。
2. `harmony/entry/oh-package.json5` 用
   `file:../../node_modules/@react-native-oh-tpl/react-native-ble-plx/harmony/rn_bleplx.har`
   引入 har。
3. `PackageProvider.ets` 注册 har 的 `BlePlxPackage`（ArkTS turbo module `BlePlx`）。
4. har 只有 ArkTS 实现，CAPI 架构下还必须要有 C++ method map：
   `harmony/entry/src/main/cpp/BlePlxTurboModule.h` 列出模块方法，`AppPackage.h` 在
   `name == "BlePlx"` 时返回它（与 image-picker 的接法相同）。少了这一步 RNOH 会抛
   `Couldn't find Turbo Module 'BlePlx' on the CPP side.`
5. har 的 `BlePlxModule.ts` 还 import 了只有 RNOH codegen 才会生成的
   `@rnoh/react-native-openharmony/generated/ts`；本工程没有 codegen，所以
   `scripts/inject-rnoh-codegen-stub.js` 在 `ohpm install` 之后写一个 type-only 的
   `TM.BlePlx.Spec`（空 interface；模块自己的 `BlePlxInterface` 仍然约束每个方法），
   CI 里也加了这一步。踩坑记录见 `docs/harmony-setup.md`。
6. JS 侧没有用包的 `BleManager`：它经 RN 0.72 的 `TurboModuleRegistry` 先查 legacy
   `NativeModules`，RNOH 对每个名字都返回空 stub（与 async-storage / clipboard /
   image-picker 同因）。`src/native/bluetoothLe.ts` 直接通过
   `global.__turboModuleProxy('BlePlx')` 取模块，并在其上补了超时、错误分类与扫描节流。

#### 真机实测（HUAWEI Mate 60 Pro / API 26 / 浅色主题）

- 行状态 `可用`；点「扫描」→ `ACCESS_BLUETOOTH` 已授权（上一批动态权限卡里申请过，
  hilog `ACCESS_BLUETOOTH: state: 0`），开始扫描并显示 `扫描中… 已发现 N 台`。
- 结果：4 秒内 141～146 台，约 40 秒累计 288 台（这台机器附近 BLE 广播非常密）。
  列表内滑动可看到其余设备；每行 `设备名（或「未命名设备」）/ 地址 · RSSI` + `连接`。
  地址是虚拟地址，例如 `98:B6:DF:A1:BD:A1`、`E2:8A:70:31:AF:9F`、
  `68:8C:F2:80:38:CC`，与 issue 里 KMP 版看到的随机地址一致。
- 连接成功：点 `68:8C:F2:80:38:CC` 行的「连接」→ 行内 `已连接 68:8C:F2:80:38:CC`，
  该行按钮变成 `断开`。
- 连接失败：点 `E2:8A:70:31:AF:9F` 行的「连接」→ 约 15 秒后
  `连接失败：连接超时（15 秒内没有完成连接，鸿蒙上部分随机地址不可连接）`。
  这正是 issue 说的「一半附近广播不可连接」，页面给出具体原因。
- 关蓝牙再扫描：设置里关掉蓝牙后回到 App 点「扫描」→ 行内
  `蓝牙已关闭，请先打开系统蓝牙再扫描`，设备列表清空且不再刷新，没有显示成
  「附近没有设备」。

#### 检查

- `npx tsc --noEmit`：通过。
- `npx eslint src __tests__ scripts`：通过（0 error / 0 warning）。
- `npx jest`：21 个测试文件、143 个用例通过。本单新增：
  - `__tests__/bluetoothLe.test.ts`（14 个用例）：状态映射、扫描去重 / 节流 / 排序、
    扫描错误事件、停止并最后刷新一次、拒绝启动扫描、连接与断开、15 秒超时兜底、
    错误分类（超时 / 拒绝 / 无权限 / 未知）、断开失败原因、平台断线监听。
  - `__tests__/bluetoothCard.test.tsx`（9 个用例）：可用状态与两条平台说明、权限申请
    → 设备行（名称 / 地址 / RSSI / 连接按钮）、大结果集窗口化（120 台只挂载 ≤32 行、
    滚动切换窗口）、连接成功后按钮变「断开」、超时原因、权限步骤失败原因、
    蓝牙已关闭、权限被拒绝、停止与平台断线回退。
  - `__tests__/capabilitiesScreen.test.tsx`：蓝牙行改为「可用」，断言卡片自带扫描按钮、
    没有单项能力按钮。
- HarmonyOS 构建：`ohpm install --all` + `hvigorw ... assembleHap` 通过（未签名 HAP 与
  本地签名 HAP 都构建过）；CI 的 harmony job 加了 codegen stub 步骤。

#### 验收证据

截图在 `docs/evidence/capabilities/bluetooth/`；基线是 `main`（`b34122b`），改后是同一台
机器、同一浅色主题、同一页面滚动位置的 HAP。

| 场景 | 基线（before） | 改后（after） |
| --- | --- | --- |
| 蓝牙行 | `before-bluetooth.png`「未实现」 | `after-bluetooth-idle.png`「可用」+ 扫描 + 两条平台说明 |
| 扫描结果 | —（没有按钮） | `after-bluetooth-scanning.png` 扫描中 + N 台 + 设备行 |
| 列表内滚动 | — | `after-bluetooth-scrolled.png` 在列表内滑动后的另一批设备 |
| 连接成功 | — | `after-bluetooth-connected.png` `已连接 …` + 该行 `断开` |
| 连接失败 | — | `after-bluetooth-timeout.png` 具体的超时原因 |
| 蓝牙关闭 | — | `after-bluetooth-off.png` `蓝牙已关闭，请先打开系统蓝牙再扫描` |

## 第五批：保存图片到相册（`image-save`）

本批把 `保存图片到相册` 从「未实现」变成真实的相册写入，和二维码页的
「保存到相册」是同一个能力、同一套实现：

1. JS 用 `src/qr/qrPng.ts` 把二维码矩阵编码成灰度 PNG（4 模块静区，
   PNG/CRC/Adler-32 全在 JS 里；`__tests__/qrPng.test.ts` 用 upng-js 解码后再用
   jsqr 扫回原文，证明文件可扫）。
2. 本 App 自己的 `ImageSave` ArkTS turbo module：
   `WRITE_IMAGEVIDEO` 运行时申请 → 缓存临时 PNG →
   `photoAccessHelper.createAsset(PhotoType.IMAGE, 'png', {title})` →
   `fs.openSync/writeSync/closeSync` → **读回校验字节数与 PNG 文件头** → 删临时文件。
3. 成功行内显示 `已保存到相册（KMP-RN-QR-…）`；权限被拒显示上一批的
   `被拒绝了；这个平台不会再弹框，点「去设置」`，并多一个同样的「去设置」按钮；
   平台写入失败显示原始 code / message，不假装成功。

`WRITE_IMAGEVIDEO` 是 `user_grant` + `system_basic` 的 ACL 权限：
`module.json5` 已声明（`reason` + `usedScene`），本机调试 profile 需要重新生成后才能
带上 `acls.allowed-acls`（见 [harmony-setup.md](../harmony-setup.md) 的签名条目）。
签名材料不进仓库，`build-profile.json5` 的 `signingConfigs` 仍是 `[]`。
Android / iOS 没有对应的保存模块，行内会如实显示「本实现只接了 HarmonyOS」。

### 检查

- `npx tsc --noEmit`：通过。
- `npx eslint src __tests__`：通过（0 error / 0 warning）。
- `npx jest`：24 个测试文件、175 个用例通过。本批新增：
  - `__tests__/qrPng.test.ts`（11 个用例）：PNG 签名/尺寸/静区/黑模块、jsqr 扫回
    英文与中文、矩阵不完整与非正 scale 拒绝、scale 夹取、标题的时间戳。
  - `__tests__/imageSave.test.ts`（9 个用例）：成功结果、拒绝与平台失败可区分、
    模块未注册、空 base64 / 空标题、原生 reject、成功但缺 URI、非法结构。
  - `__tests__/qrScreen.test.tsx`（7 个用例）：按钮不再是「不可用」、真实 PNG 可扫回、
    成功后文案、拒绝后「去设置」、平台失败原因、模块缺失、空内容禁用按钮。
  - `__tests__/capabilitiesScreen.test.tsx`：状态列表加入 `image-save`，并覆盖
    能力页保存成功、拒绝后「去设置」、写入失败三个分支。
  - `__tests__/permissions.test.ts`：`openAlbumWritePermissionSettings` 走同一个原生
    `openPermissionSettings('photo_write')`。

### 验收证据

截图在 `docs/evidence/qr/save/`；基线是本单开始前的 `main`（`4968d75`）安装包，
改后是同一台机器、同一浅色主题、同一页面位置的 HAP。

| 场景 | 基线（before） | 改后（after） |
| --- | --- | --- |
| 二维码页保存区 | `before-qr-save.png`「保存到相册在本版本不可用」 | `after-qr-saved.png` 可用按钮 + `已保存到相册` |
| 权限弹框 | — | `after-qr-permission-dialog.png` 系统 WRITE_IMAGEVIDEO 弹框 |
| 相册里的图 | — | `after-album-photo.png` 系统相册里新保存的二维码 |
| 能力页 `image-save` 行 | `before-capability-row.png`「未实现」 | `after-capability-row.png`「可用」+ 保存按钮 |
| 能力页保存结果 | — | `after-capability-saved.png` 行内 `已保存到相册（…）` |
| 拒绝权限 | — | `after-qr-denied.png` 拒绝文案 + 「去设置」 |
| 去设置 | — | `after-qr-settings.png` 系统「图片和视频权限」页（允许写入 / 不允许 / 确定） |

## 第六批：WiFi（`wifi-network`）

本批把最后一行 `WiFi` 从「未实现」变成真实的扫描 / 当前 SSID / 候选网络连接。
新增 App 自己的 `WifiNetwork` ArkTS turbo module，接线照 `ImageSaveTurboModule`：
`WifiNetworkPackage` 注册 ArkTS 模块，`WifiNetworkTurboModule.h` 给 CAPI 架构补
method map，`AppPackage.h` 与 `PackageProvider.ets` 各加一处；JS 侧是
`src/native/wifiNetwork.ts`。

### 11. WiFi（`wifi-network`）

- 行内结构（与 KMP 的 `WifiNetworkRow` 一致）：`扫描` + `当前 SSID` + AP 数，一行说明，
  下面最多 220vp 高的可滚动 AP 列表；每行 `SSID / RSSI -45 · WPA2` + `连接`。
  加密 AP 先展开行内密码面板（KMP 用 Compose `AlertDialog`；RN 版没有为这一个
  对话框引入 `Modal`，改成卡片内联面板，字段和「连接 / 取消」行为相同）。
- 扫描：`wifiManager.startScan()`（API 21+，只需 `SET_WIFI_INFO`，应用前台 2 分钟最多
  4 次）刷新系统缓存，订阅 `wifiScanStateChange` 最多等 6 秒，然后
  `getScanInfoList()` 读缓存；旧运行时才回退到已废弃的 `wifiManager.scan()`。
  结果按 SSID 去重（同名的 2.4G / 5G 取最强），按 RSSI 降序；空 SSID 跳过。
- **空列表的三种原因分开说**：载荷同时返回 `wifiActive` 与 `locationEnabled`
  （`geoLocationManager.isLocationEnabled()`）。Wi-Fi 关 → 「Wi-Fi 未打开」；
  定位开关关 → 「WiFi 扫描需要打开系统定位开关：请下拉通知栏打开「定位」后重试」，
  并清空缓存列表；两者都开且真的为空 → 「没有发现 WiFi AP」；读取报错 →
  平台 code / message。定位开关关闭时系统仍可能返回缓存列表，页面不把它当成
  新鲜结果展示，这是 ticket 第 4 条验收的重点。
- 连接：**`addCandidateConfig()` + `connectToCandidateConfigWithUserAction()`**，
  不用 `connectToNetwork()`（需要 system_core 的 `MANAGE_WIFI_CONNECTION`）。
  系统确认框弹出后，API 20+ 的接口会等用户答复；`2501005`（无响应）和 `2501006`
  （拒绝）都映射为「已取消连接」。确认后最多 30 秒轮询 `getLinkedInfoSync().ssid`，
  切过去才显示「已连接」，否则显示具体超时原因，不写成功。
- 系统除了「是否信任…」确认框，连上无外网的 AP 后还会弹「当前 WLAN 不可上网，
  是否继续使用此 WLAN？」；这是平台行为，选择「使用」后连接保留，App 不重复弹。
- 当前 SSID：`getLinkedInfoSync()`；权限缺失或读取被拒 → 「读取当前 SSID 失败：…」，
  不编 SSID；未连接 → 「当前 SSID：未连接 Wi-Fi」。
- 权限：`module.json5` 新增 `GET_WIFI_INFO` / `SET_WIFI_INFO`，本机
  `permission_definitions.json` 实测两者都是 **system_grant + normal**（安装即授予，
  没有运行时弹框；ticket 里写 `GET_WIFI_INFO` 是 user_grant，与设备实际不一致，按设备
  为准）。扫描前调用上一批 `permissions.ts` 新增的 `requestWifiScanPermission()`，
  只申请 `APPROXIMATELY_LOCATION`（`user_grant`，`module.json5` 上一批已带
  `reason` / `usedScene`）；拒绝后仍然尝试扫描，空列表时把权限情况写进提示。
- 企业认证 EAP / WAPI 需要账号或证书字段，本页不伪造配置：扫描行照常显示加密类型，
  点「连接」直接说明本页未支持，而不是发一个只有 SSID 的假配置。

#### 为什么不是 `connectToNetwork`

`connectToNetwork` 需要 `ohos.permission.MANAGE_WIFI_CONNECTION`（system_core），
普通应用拿不到。候选网络路线只需要 `SET_WIFI_INFO`（system_grant），这是普通应用
唯一的连接通路；`addCandidateConfig` 的注释也写明调用方必须在前台。

#### 真机实测（HUAWEI Mate 60 Pro / API 26 / 浅色主题）

基线是 `main` @ `4c12543` 的安装包，改后是同一台机器、同一浅色主题的签名 HAP
（`scripts/inject-signing.py` 注入 RN profile，没有跑 `devecocli signature generate`）。

- 行状态从「未实现」变成「可用」，显示 `扫描`、`当前 SSID`、平台说明和
  「点「扫描」列出附近的 WiFi AP」。
- 第一次点「扫描」弹出系统「允许“KMP RN Demo”访问你的大致位置？」；选「仅使用期间允许」
  后开始扫描。定位开关当时是关的：扫描到 54 个 AP（系统缓存），但按最终逻辑会清空
  列表并显示定位提示。
- 在控制中心打开「位置」后再扫描：47 个 AP（另一次 62 个，AP 数随环境/扫描时机变化），
  按 RSSI 降序，行内如 `360-test-xsd1-106 / RSSI -31 · WPA2`、`000-ipc / RSSI -39 · 开放`。
- 「当前 SSID」→ `当前 SSID：HUAWEI-360`，与系统控制中心的 WLAN 名一致。
- 点加密 AP `360-test-xsd1-106` 的「连接」→ 行内密码面板「连接 360-test-xsd1-106」
  + 密码输入框 + `连接` / `取消`；点取消不发连接请求。
- 点开放 AP `360P8PRO-FC02-5081e5dd2d6a-0124` 的「连接」→ 系统确认框
  「是否信任“360P8PRO-FC02-5081e5dd2d6a-0124”并建立连接？」（取消 / 连接）。
  确认后 App 轮询到链路切换：行内 `已连接：360P8PRO-FC02-5081e5dd2d6a-0124`，
  该行按钮变「已连接」，再点「当前 SSID」→ `当前 SSID：360P8PRO-FC02-5081e5dd2d6a-0124`。
  这条 AP 无外网，系统随即弹「当前 WLAN 不可上网，是否继续使用此 WLAN？」；选「使用」
  后连接保留。验证完把设备切回原来的 `HUAWEI-360`。
- 关掉「位置」再点「扫描」→ 行内
  `WiFi 扫描需要打开系统定位开关：请下拉通知栏打开「定位」后重试`，AP 列表清空，
  不再显示缓存 AP，也没有退化成「附近没有 AP」。
- 自动化限制：系统信任框来自 `com.ohos.locationdialog` 的 UIExtension，
  `uitest uiInput click` 注入的点击不被它接受（10 秒无操作后系统自己按「无响应」结束）；
  改用 `uinput -T -c <x> <y>` 真实触摸注入才完成确认。App 侧两种结果都已验证：
  无响应 → 「已取消连接」，真实确认 → 「已连接」。这只是测试注入的限制，人工点击正常。

#### 检查

- `npx tsc --noEmit`：通过。
- `npx eslint src __tests__`：通过（0 error / 0 warning）。
- `npx jest`：26 个测试文件、200 个用例通过。本批新增：
  - `__tests__/wifiNetwork.test.ts`（12 个用例）：扫描载荷、Wi-Fi / 定位开关、
    SSID / RSSI / 加密类型校验、开放与加密 AP 的密码传递、`connected` /
    `userDeclined` / `failed` 三种结果、当前 SSID 的 `known` 区分、模块缺失。
  - `__tests__/wifiCard.test.tsx`（12 个用例）：AP 列表（SSID / RSSI / 加密）、
    定位关时清空缓存并提示、Wi-Fi 关、真正无 AP、扫描失败、当前 SSID / 未知、
    开放 AP 直连、加密 AP 密码面板、取消映射、具体失败原因。
  - `__tests__/permissions.test.ts`：`requestWifiScanPermission()` 走
    `CapabilityProbe.requestPermission('wifi_scan')`，只申请大致位置。
  - `__tests__/capabilitiesScreen.test.tsx`：WiFi 行改为「可用」，断言卡片自带
    `扫描` / `当前 SSID`，没有单项能力按钮；可用行列表加入 `wifi-network`。
- HarmonyOS 构建：`npm run dev` + `ohpm install --all` + 注入 RN 签名 profile +
  `hvigorw ... assembleHap` 通过（signed / unsigned HAP 都产出）；已在真机安装验证。

#### 验收证据

截图在 `docs/evidence/capabilities/wifi/`；基线是 `main` @ `4c12543`，改后是同一台
机器、同一浅色主题、同一页面位置的 HAP。

| 场景 | 基线（before） | 改后（after） |
| --- | --- | --- |
| WiFi 行 | `before-wifi.jpeg`「未实现」 | `after-wifi-idle.jpeg`「可用」+ 扫描 / 当前 SSID + 平台说明 |
| 位置权限 | — | `after-wifi-permission.jpeg` 系统「访问你的大致位置」弹框 |
| 扫描结果 | — | `after-wifi-scan.jpeg` 47 / 62 个 AP，含 SSID · RSSI · 加密 |
| 当前 SSID | — | `after-wifi-current-ssid.jpeg` `当前 SSID：HUAWEI-360` |
| 加密 AP 密码 | — | `after-wifi-password.jpeg` 行内「连接 …」+ 密码输入 + 连接 / 取消 |
| 系统确认框 | — | `after-wifi-connect-dialog.jpeg` 「是否信任“…”并建立连接？」 |
| 连接成功 | — | `after-wifi-connected.jpeg` `已连接：…` + 该行「已连接」+ 当前 SSID |
| 确认框取消 | — | `after-wifi-cancelled.jpeg` `已取消连接：…` |
| 定位关闭 | — | `after-wifi-location-off.jpeg` 「请下拉通知栏打开「定位」后重试」 |

## 第七批：Android / iOS

前六批把 14 行都接到了鸿蒙的真实 API 上；这一批把同一批行接到 Android 与 iOS。
根因和 issue #30 的实测一致：`@react-native-oh-tpl/*` 只是鸿蒙 fork，Android / iOS
上 autolinking 找不到原生模块，`getTurboModule()` 返回空，页面要么显示「模块没有
注册」，要么在目录卡的 catch 里触发 Hermes 的 catch-binding 问题直接红屏。

### 接入方式

| 层 | 做法 |
| --- | --- |
| 原生模块查找 | `src/native/turboModule.ts` 在 Android / iOS 上读 legacy `NativeModules`；`turboModule.harmony.ts` 保留原来的 `__turboModuleProxy` 路径。Metro 按 `harmony` 平台选文件，14 个 wrapper 本身不改 |
| 四个官方库 | `@react-native-async-storage/async-storage` 1.21.0、`@react-native-clipboard/clipboard` 1.13.2、`react-native-ble-plx` 3.2.0、`react-native-image-picker` 7.0.3（版本对齐 osc-tpl fork 的上游版本），Android / iOS 正常 autolink |
| ble-plx fork | `react-native.config.js` 把 `@react-native-oh-tpl/react-native-ble-plx` 的 ios / android 平台设为 null：该 fork 带一个指向不存在 `ios/` 目录的 podspec，会让 `pod install` 失败；鸿蒙侧本来就是手工接 har，不依赖 autolinking |
| 平台文案/状态 | `capabilityCatalog.ts`（Android）、`.ios.ts`、`.harmony.ts`；`permissionCatalog.*`；`directoryCatalog.*`。剪贴板只在鸿蒙 `limited`，WiFi 只在 iOS `limited`，权限的 ACL 说明只留在鸿蒙 |
| Android 原生 | `android/app/src/main/java/com/example/kmp/rn/capabilities/`：`CapabilityProbeModule`（设备信息 / 网络 / 目录 / 震动 / 分享 / 权限）、`ImageSaveModule`（MediaStore）、`WifiNetworkModule`（扫描缓存 + `WifiNetworkSpecifier`），`CapabilityModulesPackage` 在 `MainApplication` 注册；`AndroidManifest.xml` 补齐运行时权限 |
| iOS 原生 | `ios/KmpPlaygroundRn/`：`CapabilityProbe.mm`、`ImageSave.mm`（PHPhotoLibrary）、`WifiNetwork.mm`（iOS 只返回平台限制，不伪造 AP）；`Info.plist` 补 10 条 usage string；`.mm` 与 8 个系统 framework 加进 target |

Android 与 iOS 的权限都映射成同一套三态 `granted` / `denied` / `notDetermined`：
Android 用 `checkSelfPermission` + 首次申请记录（SharedPreferences）区分
`notDetermined`；iOS 用各框架的 authorization status。

### 各平台状态

| 行 | 鸿蒙 | Android | iOS |
| --- | --- | --- | --- |
| 本地存储 / 剪贴板 / 相册选图 / 蓝牙 LE / 图片解析 | 可用 | 可用 | 可用 |
| 设备信息 / 网络 / 存储目录 / 震动 / 分享 / 动态权限 / 保存图片到相册 / URL | 可用 | 可用 | 可用 |
| WiFi | 可用 | 可用（扫描 + 连接） | **部分可用**：无 Access WiFi Information / Hotspot entitlement，只显示平台限制 |
| 剪贴板 | 部分可用（PasteButton） | 可用 | 可用（iOS 16+ 读取会弹系统粘贴确认） |

### 验证

- **Android 模拟器（API 36，1080×2400，浅色）**：基线是 `main` @ `7bd1957` 的
  APK + 同一 Metro 上的 main JS；改后是 ticket 分支的 APK + 分支 JS。基线一进
  能力页就在 `loadDirectories` 的 catch 里红屏
  （`Property 'error' does not exist`，截图 `before-capabilities-top.png`）；改后
  14 行状态、目录路径、设备信息、网络、剪贴板、分享、URL、WiFi 扫描（1 个虚拟 AP
  `AndroidWifi`）、保存图片到相册（MediaStore 里有 `KMP-RN-QR-*.png`）都在行内
  显示真实结果（`after-capabilities-top.png`、`after-capabilities-ble-wifi.png`）。
  设备信息为 `sdk_gphone64_arm64 · Android 16 · KmpPlaygroundRn 1.0`，网络为
  `已联网 · wifi`。
- **Android 真机（JEF-AN00 / `E6EDU20424002801`）**：设备处于锁屏且需要密码/指纹，
  `adb shell input` 的滑动不被 keyguard 接受，`locksettings` 也要 credential；
  因此 BLE 真实广播、WiFi 真实 AP、震动马达三项**未在真机验证**。模拟器上没有
  蓝牙硬件（扫描能启动但 0 台）也没有振动马达，这两项只能算「模块可调用」，
  不能算能力已验证。
- **iOS**：`pod install` 可用（`NO_FLIPPER=1`；Flipper 在 Xcode 27 下编不过），
  `xcodebuild` 用 `IPHONEOS_DEPLOYMENT_TARGET=15.0` 覆盖（工程仍是 12.4，未改，
  避免替产品决定最低版本）+ Yoga/glog 加 `-Wno-error=deprecated-*` 后
  **BUILD SUCCEEDED**，三个 `.mm` 参与编译与链接。但 App 一启动即被 iOS 27 SDK
  拒绝：`Application failed to launch: UIScene life cycle is required for apps
  built with this SDK`（RN 0.72 的 `RCTAppDelegate` 还是旧 `window` 生命周期）。
  这是工具链/RN 版本的限制，不是本批代码的错误；在没有 Xcode 15/16 或没有把
  AppDelegate 迁到 UIScene 之前，iOS **运行时未验证**（含权限弹框、相册写入、
  分享面板）。iOS WiFi 在本机没有 entitlement，代码只返回限制说明，也没有可验证
  的真实扫描。
- **鸿蒙回归**：`npm run dev` 生成的 `bundle.harmony.js` 里是
  `__turboModuleProxy` 版本和 `.harmony` 文案（`photoAccessHelper` / `PasteButton` /
  `addCandidateConfig`），不含 Android/iOS 的文案；本机没有 hvigor/ohpm，HAP
  编译交给 CI 的 harmony job，JS 侧没有回归。`npx tsc --noEmit`、`eslint`、
  `jest`（26 个文件 / 201 个用例）通过。

### 证据

截图在 `docs/evidence/capabilities/android/`：

| 场景 | 基线（main @ 7bd1957） | 改后（本分支） |
| --- | --- | --- |
| 能力页顶部 | `before-capabilities-top.png` 红屏 `Property 'error' does not exist` | `after-capabilities-top.png` 14 行可用 + 真实目录路径 |
| BLE / WiFi / 保存图片 | 同上（页面已崩） | `after-capabilities-ble-wifi.png` WiFi 扫描结果、相册保存结果 |

「保存图片到相册」的真实文件也在设备上核对过：
`/sdcard/Pictures/KmpPlaygroundRn/KMP-RN-QR-20261117-231125.png`（157290 字节），
MediaStore 的 `_display_name` 与行内回显一致。

### 已知限制

- iOS WiFi 无 entitlement，永远只能是 `limited`；iOS BLE / 震动在模拟器上无法验证。
- Android 9 及以下的 legacy WiFi 连接、`WRITE_EXTERNAL_STORAGE` 相册写入路径没有
  设备可测；当前设备/模拟器都是 Android 12+。
- iOS 工程的最低版本仍是 12.4；Xcode 27 本地验证时只用了命令行覆盖，没有提交
  `platform :ios, '15.0'`。CI 的 ios job 仍保持禁用。

## 与 KMP 版的几处有意差异

1. **剪贴板状态**：KMP 显示「可用」（它有 PasteButton）；RN 显示「部分可用」，
   原因见上。
2. **回调细节**：KMP 的能力枚举把 `readNeedsPasteControl` 交给页面额外插一个
   PasteButton；RNOH 没有对应的嵌入方式，因此只保留按钮 + 限制说明。
3. **存储目录的「刷新」**：KMP 的刷新会重新申请两个 user_grant 权限；RN 版
   保持一致，但首次打开只读取、不申请。手机上这两个公共目录 API 都返回 801，
   因此行内是说明而不是路径。
4. **震动回退的文案**：与 KMP 相同（物理反馈被系统触感开关忽略、改用通知场景
   振动），只是 RN 版把这句话放在行内结果里，而不是 KMP 的 `Ok` 消息。
5. **WiFi 的扫描来源**：KMP 直接读 `getScanResultsSync()` 的系统缓存，不检查定位
   开关；RN 用 API 21+ 的 `startScan()` 刷新缓存，并把定位开关作为展示前置条件
   （关了就清空列表、提示去打开），对应 ticket 第 4 条验收。
6. **WiFi 的密码输入**：KMP 用 Compose `AlertDialog`；RN 在卡片内展开密码面板，
   字段和「连接 / 取消」行为相同，没有为单个对话框引入 `Modal` 依赖。
7. **WiFi 连接结果**：KMP 文档记录候选连接「确认后仍未切网」；RN 本单在同一台
   API 26 设备、用 `uinput` 真实确认系统信任框后，实际切到了 `360P8PRO-…` 并读到新
   SSID（另有「WLAN 不可上网」平台提示）。两次测试的网络环境/系统版本可能不同，
   这里不据此否定 KMP 的记录；页面在没切网时仍然如实报超时。
8. **蓝牙列表的失败文案**：KMP 版把连接失败原因写在卡片里；RN 版同样行内展示，
   但超时由 JS 侧 15 秒兜底（ArkTS 适配版的 `connectToDevice` 只在连上时 resolve，
   不会自己超时），这是适配包的行为差异，不是页面文案差异。

## 后续

14 项能力在 RN 版都已接真实平台 API，没有「未实现」占位；剩下的是平台限制本身：

- 剪贴板读取若要变成完全可用，需要在 RNOH 里新增一个包装 ArkTS `PasteButton` 的
  自定义组件，并把一次性的读取结果回传给 JS（KMP 用的是 nativeEmbeds）。
- WiFi 的 EAP / WAPI 企业网络需要账号或证书配置，本页仍会如实说明未支持；
  定位关闭时扫描依赖系统缓存，页面不会展示缓存冒充新扫描。
- 相册 / 通讯录读取仍是 `system_basic` ACL 权限，普通场景继续用系统 Picker。

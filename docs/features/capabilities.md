# 平台能力页

能力页从骨架推进到两批真实能力。14 行的名称、说明、顺序仍与 KMP 版
（`CapabilitiesScreen.kt` 真机 dump）一致；页面结构也还是 KMP 的
`名称 + 说明 + 右上状态 + 下方操作按钮 + 行内结果`：

- **可用**（7 行）：本地存储、存储目录、设备信息、网络状态、打开外部链接、
  从相册选图、图片解析二维码。
- **部分可用**（1 行）：剪贴板。写入可用，读取被鸿蒙的系统权限限制，行内写明原因。
- **未实现**（6 行）：其余能力继续显示「未实现」，没有按钮。

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
| `src/data/directories.ts` | 7 个目录的中文标签（与 KMP 的 `DirectoryKind.label` 一致） |
| `harmony/entry/oh-package.json5` | 新增 async-storage、clipboard 两个 har 依赖（前一批） |
| `harmony/entry/src/main/cpp/PackageProvider.cpp` | 注册两个包的 C++ method map（CAPI 架构） |
| `harmony/entry/src/main/ets/PackageProvider.ets` | 注册两个包的 ArkTS turbo module，以及本单的 `CapabilityProbePackage` |
| `harmony/entry/src/main/ets/capabilities/CapabilityProbeTurboModule.ets` | `@ohos.deviceInfo` / `@ohos.net.connection` / `Context` + `@ohos.file.fs` 的真实读取 |
| `harmony/entry/src/main/cpp/CapabilityProbeTurboModule.h` | `CapabilityProbe` 三个 Promise 方法的 C++ method map |
| `harmony/entry/src/main/module.json5` | 新增 `GET_NETWORK_INFO` 和两个公共目录的 user_grant 权限 |

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

## 与 KMP 版的三处有意差异

1. **剪贴板状态**：KMP 显示「可用」（它有 PasteButton）；RN 显示「部分可用」，
   原因见上。
2. **回调细节**：KMP 的能力枚举把 `readNeedsPasteControl` 交给页面额外插一个
   PasteButton；RNOH 没有对应的嵌入方式，因此只保留按钮 + 限制说明。
3. **存储目录的「刷新」**：KMP 的刷新会重新申请两个 user_grant 权限；RN 版
   保持一致，但首次打开只读取、不申请。手机上这两个公共目录 API 都返回 801，
   因此行内是说明而不是路径。
4. **其余 6 行**：依旧没有实现，也没有为页面好看加占位依赖。

## 后续

其余 6 项（震动、分享、动态权限、BLE、WiFi、相册写入）仍按 KMP 的
`PlatformCapabilities` 接口逐项移植；在实现之前，本页保持「未实现」并在
`src/data/capabilities.ts` 里改对应行的 `status` / `action` 即可。
剪贴板若要变成完全可用，需要在 RNOH 里新增一个包装 ArkTS `PasteButton` 的自定义
组件，并把一次性的读取结果回传给 JS（KMP 用的是 nativeEmbeds）。

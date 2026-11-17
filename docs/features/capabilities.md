# 平台能力页

这一单把能力页从骨架推进到第一批真实能力。14 行的名称、说明、顺序仍与 KMP 版
（`CapabilitiesScreen.kt` 真机 dump）一致；页面结构也还是 KMP 的
`名称 + 说明 + 右上状态 + 下方操作按钮 + 行内结果`：

- **可用**（4 行）：本地存储、打开外部链接、从相册选图、图片解析二维码。
- **部分可用**（1 行）：剪贴板。写入可用，读取被鸿蒙的系统权限限制，行内写明原因。
- **未实现**（9 行）：其余能力继续显示「未实现」，没有按钮。

首屏、购物车、扫码页的现有对齐没有改动。

## 页面结构

| 文件 | 内容 |
| --- | --- |
| `src/data/capabilities.ts` | 14 项的静态定义（`id` / `title` / `detail` / `status` / `action` / `actionLabel` / `limitation`） |
| `src/screens/CapabilitiesScreen.tsx` | 头部、标题/副标题、`ScrollView` 里的 14 张卡片；每个可用项在行内调用真实 API 并显示结果 |
| `src/native/urlOpener.ts` | `isNavigableUrl` 守卫 + `Linking.openURL` |
| `src/native/asyncStorage.ts` | HarmonyOS `RNCAsyncStorage` turbo module 的 JS 封装（写 / 读 / 删） |
| `src/native/clipboard.ts` | HarmonyOS `RNCClipboard` turbo module 的 JS 封装（写 / 读） |
| `harmony/entry/oh-package.json5` | 新增 async-storage、clipboard 两个 har 依赖 |
| `harmony/entry/src/main/cpp/PackageProvider.cpp` | 注册两个包的 C++ method map（CAPI 架构） |
| `harmony/entry/src/main/ets/PackageProvider.ets` | 注册两个包的 ArkTS turbo module |

## 状态规则

| RN 状态 | 标签 | 样式 | 行内操作区 |
| --- | --- | --- | --- |
| `available` | `可用` | 绿色（`#2E7D32`）细边框 | 一个橙色按钮，调用真实 API，结果显示在按钮下方 |
| `limited` | `部分可用` | 橙色（`#EF6C00`）细边框 | 按钮照常可用，另有一行橙色限制说明 |
| `unimplemented` | `未实现` | 灰色（`#9E9E9E`）细边框 | **没有按钮**，灰色文字 `RN 版本暂未实现` |

「没有按钮」和骨架时一样是刻意的：比一个看起来能点、点了没反应的按钮更符合要求。
`limited` 是这一单为剪贴板新增的状态（见下文「为什么剪贴板不是『可用』」）。

## 三项新能力

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

## HarmonyOS 依赖怎么接的

两个包都按之前 WebView / svg / image-picker 的手工接入方式（本工程没有 RNOH
autolinking）：

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

## 验证

- `npx tsc --noEmit`：通过。
- `npx eslint src __tests__`：通过（0 error / 0 warning）。
- `npx jest`：13 个测试文件、70 个用例通过。新增：
  - `__tests__/urlOpener.test.ts`：http(s) 放行、非 http(s) 在调用平台前拒绝、
    平台失败转成回显原因。
  - `__tests__/asyncStorage.test.ts`：读、缺失 key → `null`、模块错误、写/删调用形状、
    模块未注册的明确报错。
  - `__tests__/clipboard.test.ts`：写/读调用、拒绝对象转成可读原因、模块未注册。
  - `__tests__/capabilitiesScreen.test.tsx`：14 行顺序、三种状态、`limited` 行
    有按钮和限制说明、未实现行没有按钮、三项能力的调用与行内回显。
- 真机（1260×2720，浅色主题）：每次只装一项能力再验（按作者要求的
  链接 → 存储 → 剪贴板顺序）。基线是 `d596e7a` 的 HAP；改后是本单 HEAD 的 HAP。
  - 基线：本地存储、打开外部链接、剪贴板三行都是「未实现 / RN 版本暂未实现」
    （[before-capabilities-top.png](../evidence/capabilities/before-capabilities-top.png)、
    [before-capabilities-url-clipboard.png](../evidence/capabilities/before-capabilities-url-clipboard.png)）。
  - 改后：三行分别可用 / 可用 / 部分可用，行内回显见
    [after-capabilities-top.png](../evidence/capabilities/after-capabilities-top.png)、
    [after-capabilities-url-clipboard.png](../evidence/capabilities/after-capabilities-url-clipboard.png)。
  - 其余 9 行仍全部显示「未实现」，没有按钮。

## 与 KMP 版的三处有意差异

1. **剪贴板状态**：KMP 显示「可用」（它有 PasteButton）；RN 显示「部分可用」，
   原因见上。
2. **回调细节**：KMP 的能力枚举把 `readNeedsPasteControl` 交给页面额外插一个
   PasteButton；RNOH 没有对应的嵌入方式，因此只保留按钮 + 限制说明。
3. **其他 9 行**：依旧没有实现，也没有为页面好看加占位依赖。

## 后续

其余 9 项（存储目录、设备信息、网络、震动、分享、动态权限、BLE、WiFi、相册写入）
仍按 KMP 的 `PlatformCapabilities` 接口逐项移植；在实现之前，本页保持
「未实现」并在 `src/data/capabilities.ts` 里改对应行的 `status` / `action` 即可。
剪贴板若要变成完全可用，需要在 RNOH 里新增一个包装 ArkTS `PasteButton` 的自定义
组件，并把一次性的读取结果回传给 JS（KMP 用的是 nativeEmbeds）。

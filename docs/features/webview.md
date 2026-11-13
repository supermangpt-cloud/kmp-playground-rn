# H5 / WebView 页与鸿蒙三方库接入实录

这一单把 RN 版补上「H5 演示」页，同时验证 **RN 0.72.5 + 鸿蒙适配版三方库** 这条路：
清单页 → H5 页 → 本地 HTML 按钮回传 → 返回列表，非法 scheme 跳转在页面内拦截。
功能对齐 KMP 版的 `isWebUrl` / `isNavigableUrl` 与「H5 演示」入口。

## 依赖与版本（兼容性结论）

只接入了 webview，没有装 `vision-camera` / `qrcode-svg`：

```sh
npm install @react-native-oh-tpl/react-native-webview@13.10.3 --save-exact
```

`package.json` 里还显式写了上游基线 `react-native-webview@13.10.2`。它不是第二个库：
适配包本身就依赖这个版本（`dependencies` 里已经装进来），但 RN 的 autolinking 只看
`package.json` 的直接依赖，不写成直接依赖时 Android/iOS 不会链接原生模块，页面一打开
就会因找不到 `RNCWebView` 而报错。鸿蒙侧仍由上面的适配包提供实现。

| 项 | 值 |
| --- | --- |
| 鸿蒙适配包 | `@react-native-oh-tpl/react-native-webview` `13.10.3` |
| 上游基线 | `react-native-webview` `13.10.2`（适配包的 dependency） |
| `peerDependencies` | `react-native: "*"` |
| 官方兼容表 | `<= 13.10.4` 为 `RN 0.72.*`、`API12+`（`@react-native-oh-tpl` 已标记 deprecated，但仍是 0.72 线可用版本） |
| 本机 SDK | HarmonyOS 26.0.0 / API 26，RN 0.72.5，RNOH 0.72.140 |

**结论：`@react-native-oh-tpl/react-native-webview@13.10.3` 在 RN 0.72.5 + HarmonyOS
API 26 上可用，不需要降级，也没有触发「har 要求高于本机 SDK」的情况。判断依据是
CI `harmony` job 从零 `ohpm install` + `assembleHap` 通过，以及真机
`FMR0224125000567` 上的实际运行（见文末），不是只看了编译。**
`ohpm install` 阶段没有报错，完整输出见下。

`ohpm install --all` 只提示一个版本冲突（适配包声明的是 RNOH `0.72.59`，本工程是
`0.72.140`），ohpm 自动统一到了 `0.72.140`：

```console
$ cd harmony && ohpm install --all
ohpm WARN: Found version conflict(s) in dependencies of project, and we have helped you resolve it automatically.
ohpm WARN: dependency "@rnoh/react-native-openharmony" has conflict versions: "0.72.140", "0.72.59", and has been resolved as "0.72.140" ...
install completed
```

没有出现 API 版本相关的 `ohpm` 报错，因此没有走「贴完整报错后停下」的分支。

## 鸿蒙侧集成步骤（实际写法）

### 1. `harmony/entry/oh-package.json5`

用 **har** 引入（官方 usage-docs 的首选方式）：

```json5
"@react-native-oh-tpl/react-native-webview":
  "file:../../node_modules/@react-native-oh-tpl/react-native-webview/harmony/rn_webview.har"
```

试过 issue 骨架里的「直接引用源码目录」：

```json5
"file:../../node_modules/@react-native-oh-tpl/react-native-webview/harmony/rn_webview"
```

`ohpm install --all` 能成功，但 hvigor 编译 ArkTS 时会失败，因为 ohpm 把该依赖
软链到 `node_modules/` 下，hvigor 解析不到它的 OhmUrl：

```text
ArkTS: ERROR 10311002
Failed to resolve OhmUrl. Failed to get a resolved OhmUrl for
".../node_modules/@react-native-oh-tpl/react-native-webview/harmony/rn_webview/index.ets"
imported by ".../harmony/entry/src/main/ets/pages/Index.ets".
```

当前 ohpm 26 的 `install` 没有 old usage-docs 里写的 `--no-link` 选项，所以按文档的
「har 包引入」方式落地；har 解包目标在 `harmony/oh_modules/.ohpm/...`，不再是
`node_modules` 软链，ArkTS 可以正常解析。

### 2. `harmony/entry/src/main/cpp/CMakeLists.txt`

```cmake
add_subdirectory(
    "${OH_MODULE_DIR}/@react-native-oh-tpl/react-native-webview/src/main/cpp"
    ./webview)
...
target_link_libraries(rnoh_app PUBLIC rnoh_webview)
```

### 3. `harmony/entry/src/main/cpp/PackageProvider.cpp`

```cpp
#include "WebViewPackage.h"
...
return {std::make_shared<WebViewPackage>(ctx)};
```

### 4. `harmony/entry/src/main/ets/PackageProvider.ets`

```ts
import { WebViewPackage } from '@react-native-oh-tpl/react-native-webview';

export function getRNOHPackages(ctx: RNPackageContext): RNPackage[] {
  return [new WebViewPackage(ctx)];
}
```

### 5. `harmony/entry/src/main/ets/pages/Index.ets`

WebView 是 Fabric 自定义组件，除了 Package 还要在 custom component builder 里注册：

```ts
import { WebView, WEB_VIEW } from '@react-native-oh-tpl/react-native-webview';

@Builder
export function buildCustomRNComponent(ctx: ComponentBuilderContext) {
  if (ctx.componentName === WEB_VIEW) {
    WebView({
      ctx: ctx.rnComponentContext,
      tag: ctx.tag,
    });
  }
}
```

其余 `harmony/` 配置没动，`signingConfigs` 保持 `[]`，`oh_modules/` 不进仓库。

## JS 侧实现

| 文件 | 内容 |
| --- | --- |
| `src/web/demo.html` | 本地 H5 页面（无外网）：按钮通过 `window.ReactNativeWebView.postMessage` 回传 JSON，另有一个 `tuitui://` 链接模拟 360 扫码落地页 |
| `src/web/demoHtml.ts` | `demo.html` 的字符串镜像，供 `source={{html}}` 使用；Metro 0.72 不能直接 import `.html`。`npm run build:demo-html` 重新生成，`__tests__/demoHtml.test.ts` 防止两边漂移 |
| `src/screens/WebPageScreen.tsx` | WebView 页面：顶部返回 + 地址说明、底部「最近一次回传」和拦截提示 |
| `src/ui/webUrl.ts` | `isWebUrl` / `isNavigableUrl`，语义照搬 KMP `WebUrl.kt`（大小写不敏感、只认 http/https、`https.evil://` 不算） |
| `src/screens/ProductListScreen.tsx` | 列表页加「H5 演示」入口（KMP 版入口卡的位置） |
| `App.tsx` | `Screen` 增加 `{kind: 'web'}`，返回栈和系统返回键继续复用现有逻辑 |

页面加载本地 HTML 用 `source={{html: DEMO_HTML}}`，不依赖外网，CI/离线环境也能跑。
导航前统一过 `isNavigableUrl`：`about:blank`/首屏 `data:` 文档放行，其余只允许
http/https；`tuitui://`、`intent://`、`file://`、`javascript:` 等返回 `false`，
在页面底部提示「已拦截非 http(s) 跳转：…」，不会交给原生 WebView 触发
`ERR_UNKNOWN_URL_SCHEME`。

## 验证

### JS

```console
$ npx tsc --noEmit
$ npm test -- --ci
Test Suites: 5 passed, 5 total
Tests:       18 passed, 18 total
$ npx eslint App.tsx src __tests__
✖ 2 problems (0 errors, 2 warnings)
```

新增测试：

- `__tests__/webUrl.test.ts`：KMP 同款合法/非法 URL 用例（含 `tuitui://`、`javascript:`、`https.evil://`）；
- `__tests__/webPageScreen.test.tsx`：按钮回传更新状态、`tuitui://` 被拒绝并提示、返回按钮；
- `__tests__/demoHtml.test.ts`：`demo.html` 与打包字符串一致；
- `App.test.tsx` 增加列表页「H5 演示」入口存在性断言。

### 鸿蒙构建 / 真机

```console
$ npm run dev
info Copied 5 assets
$ ohpm install --all        # 见上，退出码 0
$ hvigorw --mode module -p product=default -p buildMode=debug assembleHap --no-daemon
> hvigor Finished :entry:default@BuildNativeWithNinja... after 3 min 53 s 926 ms
> hvigor BUILD SUCCESSFUL in 3 min 56 s 451 ms
```

`rnoh_webview` 的 C++ 目标一起编译、链接进 `librnoh_app.so`；ArkTS 侧
`WebViewPackage` 和 `RNCWebView` 组件注册成功。签名后再增量构建 4.5 s，生成的
`entry-default-signed.hap` 装到了真机。

## 真机验证与证据

设备：`FMR0224125000567`（ALN-AL00，HarmonyOS 7.0.0.111 / API 26，1260×2720）。

实际操作：

1. 列表页出现「H5 演示」入口（`h5-entry`），点击进入；
2. 本地 HTML 正常渲染（标题「H5 演示页」、按钮、`tuitui://` 链接），没有外网请求；
3. 点「回传给 RN」后，页面底部状态从「等待 H5 页面回传」变成
   「最近一次回传：第 1 次点击 · 21:49:30」；
4. 点 `tuitui://h5-demo/landing` 链接后，页面底部显示
   「已拦截非 http(s) 跳转：tuitui://h5-demo/landing」，页面没有崩溃、没有跳走；
   本地 HTML 也被恢复，能继续点按钮；
5. 顶部「‹ 返回」和系统返回键都能回到商品列表；
6. 连续点拦截链接 3 次后再点「回传给 RN」，计数继续增长（2 → 3 → 4），进程仍存活。

| 证据 | 说明 |
| --- | --- |
| `before-webview-harmony-list.jpg` | 基线 `57b46f2`（main，上一单合并后的列表页，同设备/同主题/同视口）。来自上一单的真机截图，因沿用旧截图，分辨率是 630×1360 |
| `after-webview-harmony-list.png` | 同一设备、同一位置：顶部「购物车 0」下方新增「H5 演示」入口 |
| `after-webview-harmony-h5.png` | 点进 H5 页：本地 HTML 已渲染，底部仍是「等待 H5 页面回传」 |
| `after-webview-harmony-message.png` | 点按钮之后：H5 页内「已回传 1 次」+ RN 底部「最近一次回传：第 1 次点击 · 21:49:30」 |
| `before-webview-fix-blocked-blank.png` | 修复前复现缺陷：点 `tuitui://` 后 RN 提示正确，但 WebView 区域只剩空白 |
| `after-webview-fix-blocked.png` | 修复后：点 `tuitui://` 后提示正确，本地 HTML 仍在，可继续操作 |
| `after-webview-fix-restored-counter.png` | 拦截并恢复页面后再点按钮：计数从 2 继续到 3，不是从 0 重来 |

### 真机回归：拒绝导航后的白屏（已修）

首版在真机验收时发现：点 `tuitui://` 链接后，RN 状态栏正确显示「已拦截…」，
但 WebView 区域变成全白（截图采样全为 `#ffffff`），HTML 按钮也点不动；返回再进
H5 页能恢复，说明是「拒绝导航」那一下把页面清掉了。

根因不在 `handleShouldStartLoad`：`onShouldStartLoadWithRequest` 返回 `false`
的语义是「不导航」，当前页面应保持不变。`@react-native-oh-tpl/react-native-webview`
13.10.3 在鸿蒙侧把拒绝执行成了卸载页面（`RNCWebView.ets` 的 `onLoadIntercept`
返回 `true` 后 ArkWeb 清空内容），属于适配包的实现缺陷。

修法（保留真实导航拦截，不改成「HTML 只 postMessage」的旁路）：

- 在 `WebPageScreen` 里给 WebView 一个 `webViewInstance` key；
- 拒绝导航时 `setBlockedUrl(url)`，把 `lastCount` 写进下一页的
  `window.__H5_INITIAL_COUNT__`，再把 key +1 让 WebView 重新挂载同一个
  `source={{html}}`；
- 重新挂载前把 `initialDocument` 重置为允许首屏 `about:blank`/`data:`，避免恢复动作
  自己又被当成一次非法跳转；
- 没有用 `webRef.reload()` 作为恢复手段：本地 HTML 是 `loadData` 进来的，适配包的
  `reload()` 最终是 `controller.refresh()`，这条路径能否重新呈现 data 文档没有保证；
  即使恢复也会从 0 开始。重新挂载同一 `source={{html}}` 是确定性的，并能注入计数。

验证结果：拦截后提示出现且 HTML 仍在；继续点按钮计数从 2 → 3；连续拦截 3 次后
再点按钮到 4，没有死循环、没有累积白屏，进程仍存活。代价是页面内除计数外的
临时状态（滚动位置、输入框）会随重新挂载重置；本 demo 只有计数，已通过注入
`__H5_INITIAL_COUNT__` 保住。

before/after 是同一台真机、同一页面（商品列表）和同一主题；after 截图是
`devecocli ui screenshot` 的原始 1260×2720 输出，baseline 是上一单保留的
630×1360 截图，所以只看内容对比，不比较像素细节。

### Android

`npm ci` 后 `react-native config` 能看到 `react-native-webview` 已被 autolink；
本机 Java 17 下 `:app:assembleDebug` 编译通过（`BUILD SUCCESSFUL in 1m 6s`），
`react-native-webview` 的 Gradle 子任务已参与编译。**没有在 Android 设备上跑 H5 页
的按钮回传和非法链接拦截**：当时连接的 Android 设备停在锁屏，无法进入应用，因此
这两项只有鸿蒙真机证据。

## 已知限制

- 这是 RN 0.72 线最后可用的 `@react-native-oh-tpl` 版本（上游已标 deprecated）；
  后续升级 RN 时应换 `@react-native-ohos/react-native-webview`（RN 0.72 对应 `~13.10.5`，API20+）。
- 本轮只在鸿蒙真机上做交互验证；Android 只保证 native autolink + `:app:assembleDebug`
  编译通过，没有在 Android 设备上跑 H5 页的按钮回传/拦截。
- 拦截后恢复页面用的是重新挂载 WebView，页面内除计数外的临时状态会重置；如果以后
  页面有表单/滚动位置需要保留，应优先等适配包修复，或在 HTML 侧自行持久化。

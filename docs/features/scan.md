# 扫码页：自绘 ArkTS ScanPage + customScan（鸿蒙）

鸿蒙的「扫一扫」主路径现在是**独立的 ArkTS 页面** `pages/ScanPage`，用 Scan Kit 的
`customScan` 在 `XComponent` 的 surface 上预览并识码，与 KMP 版
`harmonyApp/entry/src/main/ets/scan/QrScan.ets` 同一套架构。RN 侧只通过
`ScanKit.startScanner()` 打开它、等结果，不再把相机塞进 RN 视图。

上一单的相册解码（`detectBarcode.decode` + jsqr 兜底，真机 90 ms）**没有改动**，
仍用于「平台能力」页的「图片解析二维码」。

## 1. 为什么重做：vision-camera 的码类型偏移

`@react-native-ohos/react-native-vision-camera@4.0.3` 的实时识码有一个确定性 bug：
它把 JS 的字符串码类型映射成 HMS `ScanType` 时用了数组下标。

```typescript
// vision-camera 的 ScanManager.ts
private codeType = ['unknown','aztec',...,'itf','itf-14','pdf-417','qr','upc-a','upc-e']
type = types.map(item => this.codeType.indexOf(item));   // 'qr' 的索引是 12
```

而 HMS `scanCore.ScanType` 的枚举是：

```
10 PDF417_CODE
11 QR_CODE      ← 二维码
12 UPC_A_CODE   ← 一维条码
```

`indexOf('qr')` = 12 = `UPC_A_CODE`：`codeTypes: ['qr']` 实际一直在找 UPC-A 条码。
数组里多了一个 `'itf'`，`itf-14` 之后全部偏移 1。这就是上一单「相机预览是活的、但
实时扫描不好使」的根因。

本单不 patch 这个第三方包，直接按产品要求换成与 KMP 一致的自绘页；vision-camera
从依赖、C++、ArkTS 注册中全部移除。

### 1.1 相册解码保持不变

上一单的相册解码（`detectBarcode.decode` 原生、jsqr 纯 JS 兜底）**没有改动**，
现挂在「平台能力」页的「图片解析二维码」行上。同一张 1260×2720 截图的基准数据
（来自上一单，仍适用）：

| 方案 | 耗时 |
| --- | --- |
| 旧实现：jsqr + 2000px + `attemptBoth` | 11,716 ms |
| 只优化 jsQR：800px + `dontInvert` | 7,960 ms |
| ScanKit `detectBarcode.decode`（默认路径） | 75–193 ms（常见 ~90 ms） |

历史截图：`after-album-result.png`（上一单 RN 页上的相册解码结果，该 RN 页已移除）、
`album-input-qr.jpg`（输入图）、`after-system-scan-ui.png`（系统扫码页，保留为独立入口）。

## 2. ScanPage 的实现

`harmony/entry/src/main/ets/pages/ScanPage.ets`（在 `main_pages.json` 注册，`@Entry`）：

| 环节 | 做法 |
| --- | --- |
| 预览 surface | `XComponent({type: SURFACE, controller})` 全屏；`onLoad` 里 `controller.getXComponentSurfaceId()` 取 `surfaceId` |
| 预览尺寸 | `onAreaChange` 取 XComponent 的 vp 宽高，`ViewControl.width/height` 与它一致（不一致会拉伸） |
| 启动条件 | `surfaceId` 非空且宽高 > 0 才 `customScan.init` + `customScan.start`；`onLoad`、`onAreaChange`、`onPageShow` 都调用同一个 `startSession()`，先到先等，后到的补上 |
| 扫码参数 | `scanTypes: [scanCore.ScanType.QR_CODE]`（显式枚举）、`enableMultiMode: false` |
| 权限 | `abilityAccessCtrl.requestPermissionsFromUser` 申请 `ohos.permission.CAMERA`；拒绝时显示说明 + 「去设置」+ 「返回」 |
| 去设置 | `startAbility` 打开 `com.huawei.hmos.settings` 的本应用详情页（`application_info_entry`），与 KMP 版一致 |
| 回到页面 | `onPageShow` 用 `bundleManager.getBundleInfoForSelfSync(...).appInfo.accessTokenId` + `checkAccessTokenSync` 复查权限，授权了就自动开始 |
| 结果回传 | 扫到后停扫描 → `emitter.emit(SCAN_RESULT_EVENT_ID, {scanResult: JSON})` → `router.back()`；`startScanner()` 的 Promise 在 `ScanKitTurboModule` 里 resolve |
| 取消 | 页面「取消」、系统返回都走同一个 `finish('cancelled')`，`onBackPress` 返回 `true` 消费返回键 |
| 生命周期 | `onPageHide` stop + release 释放相机；`onPageShow` 重新 init/start；`aboutToDisappear` 再兜底 release |
| 失败 | `customScan.init/start` 抛错或回调带 err 时显示「相机无法启动（错误码）」+「重试」/「返回」；「返回」resolve `failed` + reason |

**surfaceId 拿不到时怎么排查**（customScan 最常见的问题）：`surfaceId` 只在
`XComponent` 的 `onLoad` 之后才有值，`getXComponentSurfaceId()` 返回空串说明 surface
还没创建；本页把「surfaceId + 视口宽高」作为启动门槛，并在 hilog 打印
`XComponent surface id: …` 与 `customScan started on surface … (宽x高 vp)`。真机日志
（`A00000/…/ScanPage`）：

```
ScanPage: status bar inset: 37.846154 vp
ScanPage: XComponent surface id: 6343666697001
ScanPage: customScan started on surface 6343666697001 (387.692308x836.923077 vp)
```

页面在 `setWindowLayoutFullScreen(true)` 的窗口里绘制，所以相机预览可以全屏，而顶部
「取消 / 扫一扫」栏用 `window.getWindowAvoidArea(TYPE_SYSTEM).topRect` 的 vp 高度避开
状态栏（不是写死一个数字）。

### 参数对照：KMP `QrScan.ets` ↔ 本页 `ScanPage.ets`

| 参数 / 行为 | KMP `QrScan.ets` | 本页 `ScanPage.ets` |
| --- | --- | --- |
| `customScan.init` | `scanTypes: [scanCore.ScanType.QR_CODE]`, `enableMultiMode: false` | 相同 |
| `ViewControl` | `width`, `height`, `surfaceId` | 相同（宽高来自 `onAreaChange` 的 vp） |
| surface 来源 | Compose interop 传入的 `surfaceId` | `XComponent.onLoad` → `getXComponentSurfaceId()` |
| start | `customScan.start(viewControl, callback)` | 相同 |
| 结果处理 | `stop()` 后把文本经 napi 回传 Compose | `stop()/release()` 后经 emitter 回传 TurboModule → resolve JS Promise |
| 停止/释放 | 结果后与页面消失时 `stop`/`release` | 相同，另外 `onPageHide` 也停 |
| 权限 | `requestPermissionsFromUser(CAMERA)`，拒绝提示 + 设置 | 相同，并在 `onPageShow` 复查权限 |
| 去设置 | `com.huawei.hmos.settings` + `application_info_entry` | 相同 |
| 页面形态 | Compose 页（相机是嵌入的 ArkTS 组件） | 独立 `@Entry` ArkTS 页（RN 侧 push） |

## 3. TurboModule 桥接

`harmony/entry/src/main/ets/scan/ScanKitTurboModule.ets`：

- `startScanner()`：先订阅 `SCAN_RESULT_EVENT_ID`（`ScanEvents.ets`，`0x5CA9`），再
  `uiContext.getRouter().pushUrl({url: 'pages/ScanPage'})`；页面 emit 后 resolve：
  `{status: 'ok' | 'cancelled' | 'failed', value?, reason?}`。`emitter.off` 在每次
  resolve 后执行，`scanning` 标志防止叠开第二个扫码页。
- `startSystemScanner()`：原来的 `scanBarcode.startScanForResult`（系统扫码页）保留，
  作为**单独入口**，不是主路径（`enableAlbum: true`）。
- `decodeImage(uri)`：相册解码，保持不变。

C++ 方法表同步为 `decodeImage(1)` / `startScanner(0)` / `startSystemScanner(0)`
（`harmony/entry/src/main/cpp/ScanKitTurboModule.h`；CAPI 架构下 ArkTS 方法必须在
`methodMap_` 里，否则 JS 拿不到）。

JS 包装在 `src/native/scanKit.ts`：`startScanner()` 把原生结果转成
`{ok: true, value}` / `{ok: false, cancelled}` / `{ok: false, error}`，模块不存在
（iOS）时返回 `自绘扫码页只在鸿蒙版提供`。

### 3.1 Android：CameraX + ML Kit

安卓原先没有扫码，点「扫一扫」直接弹「自绘扫码页只在鸿蒙版提供」。KMP 的安卓版
是用 **CameraX + ML Kit** 自己画的取景页（`ScanPreview.android.kt`），这里照同一
套搭：

- `ScanActivity`（`android/.../rn/scan/ScanActivity.java`）：代码构建界面，
  `PreviewView` 预览 + 绿色取景框 + 「将二维码放入框内，即可自动识别」+ 取消；
  `ImageAnalysis` 每帧交给 ML Kit 的 QR 模型，识到就 `setResult` 回传；
- `ScanKitModule`（同目录）：`startScanner()` 启动上面那个 Activity 并
  `resolve({status, value, reason})`，`decodeImage(uri)` 用 ML Kit 从文件解码；
- 依赖：`androidx.camera:*:1.3.4` + `com.google.mlkit:barcode-scanning:17.2.0`。
  ML Kit 的条码模型随包内置，不依赖 Google Play 服务；
- `ScanActivity` 在 manifest 里 `exported="false"`，只能由本 App 启动。

## 4. RN 侧

`App.tsx` 的「扫一扫」入口直接调用 `startScanner()`（不再有 RN 的
`ScanScreen`）：

- 结果是 http(s) URL → `push({kind: 'web', url})`，`WebPageScreen` 用
  `isNavigableUrl` 校验后以 `source={{uri}}` 打开（非 http(s) 仍回退到本地演示页）；
- 不是 URL → 列表上弹「扫码结果」对话框显示原文；
- 失败 → 「无法扫码」对话框显示原因；
- 取消 → 什么都不做，列表保持原样。

### vision-camera 移除清单

| 位置 | 处理 |
| --- | --- |
| `package.json` / `package-lock.json` | 删除依赖；`grep -c vision-camera package.json` = **0** |
| `harmony/entry/oh-package.json5` | 删除 `vision_camera.har` 依赖 |
| `harmony/entry/src/main/cpp/CMakeLists.txt` | 删除 `add_subdirectory(.../react-native-vision-camera)` 与 `rnoh_vision_camera` 链接 |
| `harmony/entry/src/main/cpp/PackageProvider.cpp` | 删除 `VisionCameraPackage` 注册 |
| `harmony/entry/src/main/ets/PackageProvider.ets` | 删除 `VisionCameraModulePackage` |
| `harmony/entry/src/main/ets/pages/Index.ets` | 删除 `VisionCameraView` 的 `arkTsComponentNames` 与 custom builder 分支 |
| `harmony/entry/src/main/module.json5` | 删除 `GYROSCOPE`（随预览一起移除）；`ACCELEROMETER` 保留给 RNOH DevMenu 的摇一摇（注释已改正，不是 vision-camera 用的） |
| `src/types/react-native-ohos-vision-camera.d.ts` | 删除 |
| `src/native/cameraModule.ts` | 删除 |
| `__mocks__/react-native-vision-camera-harmony.js` | 删除 |
| `jest.config.js` | 删除 vision-camera 的 `moduleNameMapper` |
| `src/screens/ScanScreen.tsx` / `__tests__/scanScreen.test.tsx` | 删除，由 ArkTS 页 + `__tests__/scanFlow.test.tsx` 取代 |

验收命令：

```console
$ ls harmony/entry/src/main/ets/pages/ScanPage.ets
harmony/entry/src/main/ets/pages/ScanPage.ets
$ grep -c vision-camera package.json
0
$ grep -n 'ScanType.QR_CODE' harmony/entry/src/main/ets/pages/ScanPage.ets
          scanTypes: [scanCore.ScanType.QR_CODE],
```

## 5. 真机验证

设备：`FMR0224125000567`（Mate 60 Pro / ALN-AL00，1260×2720），签名 debug HAP。
构建：`hvigorw ... assembleHap` **BUILD SUCCESSFUL**，HAP 从 136 MB 降到 69 MB
（移除 vision-camera 的 `.so`）。证据在 `docs/evidence/scan/`。

### 5.1 预览（基线 vs 本单）

| 项 | 改动前（`b113693`，vision-camera） | 改动后 |
| --- | --- | --- |
| 页面 | RN `ScanScreen.tsx`（相机塞在 RN 视图里） | 独立 ArkTS `pages/ScanPage.ets` |
| 预览 | 页面打开后是活的画面（两帧均值差小，场景静止） | 同左；见下 |
| 实时识码 | `codeTypes: ['qr']` 被映射成 UPC-A，真机未解出过二维码 | 见 5.3：真实二维码解出 39 字符 |
| 证据 | `before-vision-camera-scan.jpg`、`before-vision-camera-scan-frame2.jpg`、`before-permission-dialog.png` | `after-scan-preview.jpg`、`after-scan-preview-frame2.jpg`、`after-permission-*.png` |

改动后的预览不是黑屏：对 1260×2720 截图去掉顶部栏后取两帧（间隔 2 s），
预览区均值 `[103.6, 119.3, 135.5]`、标准差 `[73.5, 61.1, 44.0]`，两帧
`mean abs diff = [2.02, 1.78, 2.07]`、2.56% 像素变化 >8 —— 场景本身静止，
变化来自传感器噪声/曝光，说明是活的相机流。更直接的证据是
`ScanFrameworkCustomScan` 持续收到 `surface buffer 2336×1080` 并在
`checkDecode` 上跑帧。

### 5.2 构建 / 页面 / 取消 / 权限

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| `assembleHap` | 成功；无 ArkTS 编译错误 | 构建日志 |
| 点「扫一扫」 | **自绘 ArkTS 页打开**（不是系统扫码页）；标题「扫一扫」、取景框、「取消」、提示都在状态栏下方 | `after-scan-preview.jpg` |
| 相机权限弹窗 | 系统弹窗「允许“KMP RN Demo”访问你的相机？」理由「使用相机扫描二维码」 | `after-permission-dialog.png` |
| 拒绝权限 | 页面显示「需要相机权限」+ 说明 + 「去设置」/「返回」 | `after-permission-denied.png` |
| 去设置 | 打开系统设置的本应用详情页 | `after-permission-settings.png` |
| 从设置返回（仍未授权） | 仍是拒绝页（`checkAccessTokenSync` 复查） | 日志 |
| 点「取消」 | `hilog: ScanPage: scan finished: {"status":"cancelled"}`，回到商品列表 | 日志 + `after-list.png` |
| 切后台再回来 | `page hidden, stopping…` → `customScan stopped/released` → `page shown again, restarting…` → `customScan started` | 日志 |

### 5.3 实时识码

自动化会话中相机对着环境里屏幕上的一个真实二维码，`customScan` 解出 **39 字符**：

```
ScanPage: scanned 39 chars
ScanPage: scan finished: {"status":"ok","value":"<https URL，内部页面，此处不贴出>"}
```

随后 RN 侧 `WebPageScreen` 确实挂载了该 URL（chromium 日志
`NWebHandlerDelegate::OnPageVisible`）。值是一个 http(s) URL，所以走的是「打开 H5 页」
分支；如果是普通文本则走「扫码结果」对话框。

### 5.4 没验到的 / 限制

- 识码这一次是自动化会话里相机恰好对着一个真实二维码；**没有用第二台设备做可重复的
  扫码回归**（相机朝向不可远程控制）。用户真机验收第 3 条时请再扫一次。
- 系统扫码页（`startSystemScanner()`）保留但不在主路径，本单没有重测它。
- 相册解码仍走上一单的 `detectBarcode.decode`（约 90 ms），本单未改动、未重测。
- 顶部栏避让用的是系统 status bar avoid area；折叠屏/平板等不同形态没有验证。

## 3.2 Android：RN 画界面，原生只给预览

安卓的扫码页现在由 **React Native 绘制**，原生只提供一个 Fabric 组件：

| 位置 | 内容 |
| --- | --- |
| `src/screens/ScanScreen.tsx` | ‹ 返回、标题、**取景框**、提示文案、取消——全是 RN 视图，跟其余页面同一套主题 |
| `src/native/specs/ScannerViewNativeComponent.ts` | Fabric 组件 `ScannerView` 的 codegen spec（`facing` / `onDecoded` / `onFailed` / `onReady`） |
| `android/.../rn/scanner/ScannerView.java` | `PreviewView` + CameraX + ML Kit，只负责出画面和识码，`onAttachedToWindow` 起、`onDetachedFromWindow` 停 |
| `android/.../rn/scanner/ScannerViewManager.java` | 生成的 `ScannerViewManagerInterface` 实现 + 三个事件的派发 |

`package.json` 里因此多了 `codegenConfig`（`type: components`，`jsSrcsDir:
src/native/specs`），Android 构建时由 RN gradle 插件生成
`ScannerViewManagerInterface/Delegate`。

`App.tsx` 用 `canDrawScannerInReactNative()`（当前只有 Android 为真）决定走哪条路：
Android 压入 `{kind: 'scan'}` 渲染上面这个 RN 页；鸿蒙仍然打开 ArkTS 的
`pages/ScanPage`，两条路径共用同一套结果处理（URL → H5 页，其他 → 结果对话框）。

验证（JEF-AN00）：页面元素全部是 RN 节点（`scan-frame` 是 `ViewGroup`，
`scan-hint` 是 `TextView`，`scan-preview` 是 `FrameLayout`），`dumpsys media.camera`
显示 device 0 被本 App 持有，点取消后回到列表且相机释放（客户端数量归零）。

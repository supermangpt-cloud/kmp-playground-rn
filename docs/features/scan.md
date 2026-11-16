# 扫码页：相机预览 / 实时识码 + 相册图片解码

这一单把「扫码」页加到 RN 版：列表页入口 → 相机预览 + 实时识码，并提供两个兜底
（系统扫码、相册图片解码）。核心验收不是「页面能打开」，而是**二维码内容真的被
解出来**；本文按实际验证结果写，未验证的部分明确标注。

## 1. 依赖与兼容性结论

| 包 | 版本 | 说明 |
| --- | --- | --- |
| `@react-native-ohos/react-native-vision-camera` | `4.0.3` | 相机预览 + `codeScanner`。har 里带 C++ codegen 描述符和 turbo module delegate，能在本工程的 CAPI 架构下挂载 |
| `@react-native-oh-tpl/react-native-image-picker` | `7.0.3-0.1.7` | 鸿蒙相册选择器（系统 `PhotoViewPicker`）。har 只有 ArkTS turbo module，本工程补了 C++ 方法表（见 1.3） |
| `jsqr` | `1.4.0` | 纯 JS 二维码识别，作为相册解码的兜底 |
| `jpeg-js` | `0.4.4` | 纯 JS JPEG 解码（`useTArray: true`，不依赖 Node 的 `Buffer`） |
| `upng-js` | `2.1.0` | 纯 JS PNG 解码（内部 `pako`，无 Node 内置模块） |

### 1.1 为什么是 vision-camera 4.0.3，而不是 4.0.2

`@react-native-oh-tpl/react-native-vision-camera@4.0.2-rc.1` 是旧线（deprecated），
har 只有 ArkTS、没有 C++ 组件描述符。在本工程（`enableCAPIArchitecture: true`）实测：

- JS 渲染 `<Camera>` 直接报
  `requireNativeComponent: "VisionCameraView" was not found in the UIManager.`；
- 补上 C++ delegate 让 `VisionCameraModule` 能被找到之后，组件仍然挂不上：CAPI 的
  Fabric 必须有 `ComponentDescriptor`（4.0.3 的 `src/main/cpp/generated` 就是它）。

所以换了 4.0.3：har 自带 codegen 的 C++ 描述符、`VisionCameraPackage` 和
turbo module delegate，按官方 ManualLink 的 CMake / `PackageProvider.cpp` 步骤接进来即可。

### 1.2 实时识码走的是 Scan Kit，不是 frame processor

vision-camera 官方的 HarmonyOS 兼容表里 `useFrameProcessor` 是 **不支持**，而
`codeScanner` 是支持：适配层的 `ScanManager` 用
`@kit.ScanKit` 的 `customScan.start({surfaceId})` 把相机预览画到 `XComponent`
的 surface 上，识码结果通过 `onCodeScanned`（`DeviceEventEmitter`）回到 JS。因此：

- 实时识码是**原生扫码会话**，没有 worklets / 新架构依赖；
- `codeTypes: ['qr']` 只开二维码，扫码会话由 `isActive` 控制，结果展示后
  `isActive=false` 暂停，点「继续扫描」再恢复。

**识别率**：`customScan` 是「自定义预览 + 后台识码」，对**屏幕上的二维码**（反光、
刷新率）识别率不如系统扫码页，真机体验反馈是「不太好使」。因此页面加了
「用系统扫码（识别率最好）」兜底和明确的引导文案（对准、10–20cm、别晃动、当前
正在扫描），不把「相机能打开」当成「实时扫码可用」。

### 1.3 image-picker 与 Scan Kit 的 native 桥

相册解码有两条路：

1. **ScanKit 原生图片识码（默认）**：`detectBarcode.decode({uri})` 直接读 image-picker
   返回的缓存文件 URI，毫秒级，支持 HEIC/JPEG/PNG；
2. **纯 JS（兜底）**：`image-picker` 的 base64 → `jpeg-js`/`upng-js` → `jsqr`。

为了调这两个能力，补了一个 app 自己的 `ScanKit` turbo module：

- `harmony/entry/src/main/ets/scan/ScanKitTurboModule.ets`：
  `decodeImage(uri)`、`startSystemScan()`，都是 Promise；
- `harmony/entry/src/main/cpp/ScanKitTurboModule.h`：给 CAPI 架构补 `methodMap_`
  （`ARK_ASYNC_METHOD_METADATA`），否则 RN 的 TurboModule host object 不会暴露方法；
- `src/native/scanKit.ts`：JS 包装，走 `global.__turboModuleProxy('ScanKit')`。

image-picker 本身也踩了两个坑，已修：

1. **JS 包装层不可用**：`react-native-image-picker` 用
   `global.__turboModuleProxy != null` 判断 turbo module，而 RN 0.72 的
   `TurboModuleRegistry` 会**先**查 `NativeModules[name]`；RNOH 的 legacy 表对任意
   名字都返回空对象，于是 JS 拿到「没有 `launchImageLibrary` 方法」的模块。
   本工程直接调 `global.__turboModuleProxy('ImagePicker')`（`src/native/imagePicker.ts`）。
2. **ArkTS turbo module 需要 C++ 方法表**：`ArkTSTurboModule` 默认 `methodMap_` 为空，
   补了 `harmony/entry/src/main/cpp/ImagePickerTurboModule.h`
   （`ARK_SCHEDULE_METHOD_METADATA(launchImageLibrary, 2)`，沿用它的回调式签名）。

**URI 能不能读成像素（实测）**：能。image-picker 对图片会先 `fs.openSync` 读文件、
`createImageSource` 取宽高，按 `maxWidth/maxHeight` 缩放后写缓存，`includeBase64: true`
时返回原图 base64。真机上用系统截图（1260×2720）实测：base64 长度 287,892，
原生 `detectBarcode.decode` 读出 `https://example.com`；纯 JS 路径解同一张图也得到
同一个值。**只有原生解码不可用时才请求 base64**，避免每次选图都搬运 288KB 字符串。

### 1.4 相册解码耗时（同一张 1260×2720 截图，真机实测）

| 方案 | 耗时 | 说明 |
| --- | --- | --- |
| 改动前：`jsqr` + 2000px + 默认 `attemptBoth` | **11,716 ms** | 旧实现；用户反馈「等好长时间」 |
| 改动后：`jsqr` + 800px + `dontInvert`（首轮命中） | **7,960 ms** | 只改了 jsQR，剩下的大头是纯 JS JPEG 解码 |
| 改动后：ScanKit 原生 `detectBarcode.decode`（默认路径） | **75–193 ms**（常见 ~90 ms） | 页面显示 `相册识别 · qr · 1260×2000 · ScanKit 90ms` |

结论：**jsQR 的参数优化只能把 11.7s 降到 8.0s**，因为 `jpeg-js` 在 Hermes 里解码
1260×2720 的 JPEG 就占了大头，所以最终把原生解码作为默认路径，纯 JS 只作为兜底。
两者的耗时都由页面在 `__DEV__` 下用 `console.log('[scan] album decode method=… ms=…')`
输出；上表的数字来自同一台机器、同一张图（`docs/evidence/scan/album-input-qr.jpg`）。

## 2. 鸿蒙接入

| 位置 | 改动 |
| --- | --- |
| `package.json` | vision-camera 4.0.3、image-picker 适配包、jsqr / jpeg-js / upng-js |
| `harmony/entry/oh-package.json5` | 两个 `file:` har 依赖 |
| `harmony/oh-package.json5` | 继续用 `overrides` 把 RNOH 钉在 `0.72.140`（vision-camera har 写的是 `0.72.38`） |
| `harmony/entry/src/main/cpp/CMakeLists.txt` | `add_subdirectory(.../react-native-vision-camera/src/main/cpp ./vision-camera)` + `target_link_libraries(rnoh_app PUBLIC rnoh_vision_camera)` |
| `harmony/entry/src/main/cpp/PackageProvider.cpp` | `VisionCameraPackage`、`AppPackage` |
| `harmony/entry/src/main/cpp/AppPackage.h` | `ImagePicker` / `ScanKit` 的 C++ delegate |
| `harmony/entry/src/main/cpp/ImagePickerTurboModule.h` | image-picker 方法表 |
| `harmony/entry/src/main/cpp/ScanKitTurboModule.h` | ScanKit 方法表 |
| `harmony/entry/src/main/ets/PackageProvider.ets` | `VisionCameraModulePackage`、`ImagePickerViewPackage`、`ScanKitPackage` |
| `harmony/entry/src/main/ets/scan/ScanKitTurboModule.ets` | `detectBarcode.decode` + `scanBarcode.startScanForResult` |
| `harmony/entry/src/main/ets/pages/Index.ets` | `arkTsComponentNames: [VisionCameraView.NAME]` + `buildCustomRNComponent` 里挂 `VisionCameraView` |
| `harmony/entry/src/main/module.json5` | `ohos.permission.CAMERA`（user_grant，理由 `camera_reason`）、`ACCELEROMETER`、`GYROSCOPE` |
| `harmony/entry/src/main/resources/base/element/string.json` | `camera_reason` |

## 3. 实现

| 文件 | 内容 |
| --- | --- |
| `src/screens/ScanScreen.tsx` | 扫码页：预览、实时结果、系统扫码、相册入口、扫描状态/引导、相机不可用兜底、错误提示 |
| `src/native/cameraModule.ts` | 只在 `Platform.OS === 'harmony'` 时 `require` vision-camera，避免 Android/iOS 在 import 时就找不到原生模块 |
| `src/native/turboModule.ts` | 直接经 `__turboModuleProxy` 取模块（绕开 legacy `NativeModules` 空对象） |
| `src/native/imagePicker.ts` | `launchImageLibrary(options, cb)` → Promise；缺模块时报原因 |
| `src/native/scanKit.ts` | 原生图片识码 / 系统扫码的 Promise 包装 |
| `src/qr/imageDecode.ts` | base64 → 字节 →（JPEG/PNG）→ RGBA → jsqr；两段式 800px → 2000px、`dontInvert`；HEIC/未知格式明确报「不支持」 |
| `src/screens/ProductListScreen.tsx` / `App.tsx` | 列表入口「扫码」与 `{kind: 'scan'}` 返回栈页面 |
| `__tests__/imageDecode.test.ts` | PNG（运行期生成）与 JPEG（fixture）都能解出同一段文本；坏图、HEIC、base64 往返、800/2000 常量 |
| `__tests__/scanScreen.test.tsx` | 相机结果、原生相册解码、jsqr 兜底、系统扫码成功/取消/报错、相机不可用、非鸿蒙平台 |

扫码页在非鸿蒙平台显示「扫码页只在鸿蒙版提供」：相机、相册、系统扫码都依赖鸿蒙
适配，`ScanScreen` 在渲染前才加载相机模块，避免 Android/iOS 启动即崩。

## 4. 真机验证

设备：`FMR0224125000567`（Mate 60 Pro / ALN-AL00，HarmonyOS 7.0.0.111，1260×2720），
`com.example.kmp.rn.harmony` 签名 debug HAP。证据在 `docs/evidence/scan/`。

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| `vision-camera` 接进工程 | `assembleHap` 通过，HAP 内含 `librnoh_vision_camera.so` | 构建日志 |
| 装机 → 相机预览 | 页面显示实时预览；预览区域（y 400–2200）均值亮度 10.3、标准差 25.8、近黑 13.1%；相隔 2 秒两帧有 29.3% 采样像素变化（均值绝对差 5.13）→ 活的画面，不是黑屏/白块 | `after-scan-preview.png` |
| 相机权限 | 首次进页面弹系统相机授权，允许后预览出现 | 见上 |
| 系统扫码兜底 | 点「用系统扫码」拉起 Scan Kit 系统扫码页；在其「图库」里选上面的截图，回到应用显示 `系统扫码 · qr` + `https://example.com` | `after-system-scan-ui.png` |
| 相册选图 → 原生解码 | 先在二维码页截屏（系统截图进相册），再进扫码页选它：显示 `相册识别 · qr · 1260×2000 · ScanKit 90ms` + `https://example.com` | `after-album-result.png`、`album-input-qr.jpg` |
| 列表入口 | 列表新增「扫码」入口 | `after-list.png`（改动前：`before-list.png`） |
| 页内实时识码 | 见下面的「未验证」 | — |

### 没验到的 / 限制

- **页内实时识码（`codeScanner`）没有在真机上成功解出过**。预览确认是活画面，
  但自动化环境里相机看不到二维码；真实体验反馈也是「不太好使」。因此：
  页内扫描只作为「快速尝试」，不写成「相机扫码已实现」；系统扫码和相册解码
  是能确认解出内容的路径。
- 相册解码默认走原生 ScanKit（毫秒级）；`jsqr` 兜底仍可能慢（同一张截图 ~8s，
  因为纯 JS JPEG 解码占大头），只在原生解码不可用时才会走到。
- 页面引导写死为中文，且 `customScan` 的对焦/分辨率不可从 JS 调整（适配层没有
  暴露），识别率受环境反光影响。
- 相册解码依赖 image-picker 的鸿蒙 har，Android / iOS 上扫码页显示不可用说明。
- 系统扫码页是系统 UIExtension；自动化点击需要先按坐标点开「图库」，再走系统
  的「完成」。

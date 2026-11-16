# 扫码页：相机预览 / 实时识码 + 相册图片解码

这一单把「扫码」页加到 RN 版：列表页入口 → 相机预览 + 实时识码，识别不出来时
用「从相册选图」把二维码图片交给纯 JS 解码器。核心验收不是「页面能打开」，而是
**二维码内容真的被解出来**；本文按实际验证结果写，未验证的部分明确标注。

## 1. 依赖与兼容性结论

| 包 | 版本 | 说明 |
| --- | --- | --- |
| `@react-native-ohos/react-native-vision-camera` | `4.0.3` | 相机预览 + `codeScanner`。har 里带 C++ codegen 描述符和 turbo module delegate，能在本工程的 CAPI 架构下挂载 |
| `@react-native-oh-tpl/react-native-image-picker` | `7.0.3-0.1.7` | 鸿蒙相册选择器（系统 `PhotoViewPicker`）。har 里只有 ArkTS turbo module，没有 C++ spec，本工程补了一个 `ImagePickerTurboModule`（见 1.3） |
| `jsqr` | `1.4.0` | 纯 JS 二维码识别，不需要原生适配 |
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
- 页面拿到的就是真正的扫描结果，不是「有 UI 但扫不出来」的假实现；
- `codeTypes: ['qr']` 只开二维码，扫码会话由 `isActive` 控制，结果展示后 `isActive=false`
  暂停，点「继续扫描」再恢复。

### 1.3 image-picker 的 URI / base64 能不能读成像素（先单独验了）

结论：**能**。鸿蒙适配版对图片会先 `fs.openSync` 读文件、`createImageSource`
取宽高，再按 `maxWidth/maxHeight` 缩放后写回缓存；`includeBase64: true` 时还返回
文件的 base64。真机上用系统截图（1260×2720 的 PNG→相册里的 jpg）实测：
`launchImageLibrary` 返回 `assets[0].base64`，`jsqr` 解出 `https://example.com`。

但适配包的 **JS 包装层在本工程不可用**：`react-native-image-picker` 用
`global.__turboModuleProxy != null` 判断是否 turbo module，而 RN 0.72 的
`TurboModuleRegistry` 会**先**查 `NativeModules[name]`；RNOH 的 legacy 表对任意名字
都返回一个空对象，于是 JS 拿到的是「没有 `launchImageLibrary` 方法」的模块。
本工程改为直接调 `global.__turboModuleProxy('ImagePicker')`（`src/native/imagePicker.ts`）。

还有一层：RNOH 0.72 CAPI 下 `ArkTSTurboModule` 的 `methodMap_` 默认是空的，
React Native 的 `TurboModule` host object 只暴露 `methodMap_` 里的方法。image-picker
的 har 没有 C++ spec，所以补了 `harmony/entry/src/main/cpp/ImagePickerTurboModule.h`，
用 `ARK_SCHEDULE_METHOD_METADATA(launchImageLibrary, 2)` 把
`(options, callback)` 两个入口注册进去（两个方法都是「立即返回、回调给结果」）。

## 2. 鸿蒙接入

| 位置 | 改动 |
| --- | --- |
| `package.json` | vision-camera 4.0.3、image-picker 适配包、jsqr / jpeg-js / upng-js |
| `harmony/entry/oh-package.json5` | 两个 `file:` har 依赖 |
| `harmony/oh-package.json5` | 继续用 `overrides` 把 RNOH 钉在 `0.72.140`（vision-camera har 写的是 `0.72.38`） |
| `harmony/entry/src/main/cpp/CMakeLists.txt` | `add_subdirectory(.../react-native-vision-camera/src/main/cpp ./vision-camera)` + `target_link_libraries(rnoh_app PUBLIC rnoh_vision_camera)` |
| `harmony/entry/src/main/cpp/PackageProvider.cpp` | `VisionCameraPackage`；`AppPackage` |
| `harmony/entry/src/main/cpp/AppPackage.h` | `ImagePicker` 的 C++ delegate |
| `harmony/entry/src/main/cpp/ImagePickerTurboModule.h` | image-picker 的方法表（见 1.3） |
| `harmony/entry/src/main/ets/PackageProvider.ets` | `VisionCameraModulePackage`、`ImagePickerViewPackage` |
| `harmony/entry/src/main/ets/pages/Index.ets` | `arkTsComponentNames: [VisionCameraView.NAME]` + `buildCustomRNComponent` 里挂 `VisionCameraView` |
| `harmony/entry/src/main/module.json5` | `ohos.permission.CAMERA`（user_grant，理由 `camera_reason`）、`ACCELEROMETER`、`GYROSCOPE`（预览方向） |
| `harmony/entry/src/main/resources/base/element/string.json` | `camera_reason` |

## 3. 实现

| 文件 | 内容 |
| --- | --- |
| `src/screens/ScanScreen.tsx` | 扫码页：预览、实时结果、相册入口、相机不可用兜底、错误提示 |
| `src/native/cameraModule.ts` | 只在 `Platform.OS === 'harmony'` 时 `require` vision-camera，避免 Android/iOS 在 import 时就找不到原生模块 |
| `src/native/imagePicker.ts` | 直接调 turbo module 的 `launchImageLibrary(options, cb)`，包成 Promise；拿不到模块时给出原因 |
| `src/qr/imageDecode.ts` | base64 → 字节 →（JPEG/PNG）→ RGBA → jsqr；HEIC/未知格式明确报「不支持」，不误报成「没有二维码」 |
| `src/screens/ProductListScreen.tsx` / `App.tsx` | 列表入口「扫码」与 `{kind: 'scan'}` 返回栈页面 |
| `__tests__/imageDecode.test.ts` | 运行期生成的 PNG + 提交的 JPEG fixture 都能解出同一段文本；坏图、HEIC、base64 往返 |
| `__tests__/scanScreen.test.tsx` | 相机结果、相册结果、解码失败、缺 base64、相机不可用、非鸿蒙平台 |

扫码页在非鸿蒙平台显示「扫码页只在鸿蒙版提供」：相机和相册都依赖鸿蒙适配包，
`ScanScreen` 在渲染前才加载模块，避免 Android/iOS 启动即崩。

## 4. 真机验证

设备：`FMR0224125000567`（Mate 60 Pro / ALN-AL00，HarmonyOS 7.0.0.111，1260×2720），
`com.example.kmp.rn.harmony` 签名 debug HAP。证据在 `docs/evidence/scan/`。

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| `vision-camera` 接进工程 | `assembleHap` 通过，HAP 内含 `librnoh_vision_camera.so` | 构建日志 |
| 装机 → 相机预览 | 页面显示实时预览；截图预览区域（y 400–2200）均值亮度 10.3、标准差 25.8、近黑占 13.1%；相隔 2 秒两帧有 29.3% 采样像素变化（均值绝对差 5.13）→ 是活的画面，不是黑屏/白块 | `after-scan-preview.png` |
| 相机权限 | 首次进页面弹系统相机授权，允许后预览出现 | 见上 |
| 相册选图 → 解码 | 先在二维码页截屏（系统截图进相册），再进扫码页选它：显示 `相册识别 · qr` + `https://example.com` | `after-album-result.png`（另存一份可解原图：`album-input-qr.png`） |
| 列表入口 | 列表新增「扫码」入口 | `after-list.png`（改动前：上一单的 `docs/evidence/qr/harmony-after-list.png`） |
| 相机实时识码 | 见下面的「未验证」 | — |

### 没验到的 / 限制

- **相机实时识码没有真机取证**。预览已确认是活画面，但「拿另一台设备显示二维码 →
  解出内容」需要有人把二维码对准这台设备的后置摄像头；自动化环境里没有第二块屏幕
  能被相机看到，所以这一步保持未验证，不写成「相机扫码已实现」。
- 相册解码只支持 JPEG / PNG。鸿蒙相机默认照片可能是 HEIC，纯 JS 解码器不支持，
  页面会明确提示改用截图或另存 JPEG；`imageDecode.test.ts` 用 HEIC 头验证了这条提示。
- 解码前会把长边缩到 2000px（离屏最近邻缩放），再交给 jsqr；二维码在整图里占比
  太小时可能识别不到，换更清晰/更近的图即可。
- 相册解码依赖 image-picker 的鸿蒙 har，Android / iOS 上扫码页显示不可用说明。
- `maxWidth/maxHeight` 只影响返回的缓存文件，`includeBase64` 仍是原图字节：大图
  base64 会占内存，页面按 2000px 缩放后解码，不保证极端大图不 OOM。

# 二维码页：svg 兼容性验证与生成/展示

这一单把 KMP 版的「二维码」页搬到 RN 版：列表页入口 → 输入内容 → L/M/Q/H 纠错级别 →
实时二维码 + `版本 N · M×M 模块 + 4 模块静区`，编码逻辑与 KMP 的
`shared/src/commonMain/kotlin/com/example/kmp/qr/QrCode.kt` 对齐。二维码的底座是
`react-native-svg`，所以兼容性结论放在最前面。

## 1. 依赖与兼容性结论

### 1.1 版本

| 包 | 版本 | 说明 |
| --- | --- | --- |
| `@react-native-oh-tpl/react-native-svg` | `15.0.1-8` | 首选。CAPI 实现（C++ 组件 + `SVGPackage`），官方兼容表写的是 RN 0.72.* / API12+ |
| `react-native-svg` | `15.0.0` | 适配包的上游基线/peer；Android/iOS autolinking 与 Jest 类型都用它 |
| `@react-native-oh-tpl/react-native-qrcode-svg` | `6.2.0-0.0.3` | 纯 JS：只把上游 `react-native-qrcode-svg@6.2.0` 重新导出，鸿蒙侧没有原生代码 |
| `qrcode` | `1.5.4` | `react-native-qrcode-svg` 自己的编码依赖；这里显式声明，页面用它取版本号和做纯逻辑测试（没有引入新包，树里本来就有） |

三个 `@react-native-oh-tpl` 包都在 `package.json` 里写死版本，不用 `^`。

### 1.2 结论

**`@react-native-oh-tpl/react-native-svg@15.0.1-8` 在 RN 0.72.5 + RNOH 0.72.140 +
HarmonyOS API 26 上可用。** 判断依据：

- 从零 `ohpm install --all` + `hvigorw … assembleHap` 通过（本地实测，CI 跑的是同一条命令）；
- 真机 `FMR0224125000567` 上二维码真的画出来了，截图用 `zbarimg` 能解出输入内容（见第 5 节）。

### 1.3 两个前置坑（都不是 svg 本身）

1. **ohpm 的 `^` 会把 RNOH 解析到 latest。** `@react-native-oh-tpl/react-native-svg@15.0.1-8`
   的 har 里写的是 `"@rnoh/react-native-openharmony": "^0.72.32"`，但 ohpm 会把它解析成
   当时最新的 `0.86.1`，于是整个工程被换成 RN 0.86 的 C++ 码，报的是 RN 0.86 codegen
   才有的 `butter::map`：

   ```console
   .../react-native-svg/src/main/cpp/generated/react/renderer/components/react_native_svg/Props.h:181:25:
   error: no member named 'map' in 'facebook::yoga::Gutter'
       auto map = (butter::map<std::string, RawValue>)value;
   ```

   这不是 svg 不支持 0.72，而是依赖被解析到了错误的 RNOH 版本。`harmony/oh-package.json5`
   用 `overrides` 把 `@rnoh/react-native-openharmony` 钉在 `0.72.140` 后消失。CI 基线本来
   也是 0.72.140，所以这个 overrides 是恢复基线，不是升级。
2. **npm 的 peer 冲突。** `react-native-qrcode-svg@6.2.0` 的 `peerDependencies` 写的是
   `react-native-svg: "^13.2.0"`，而 svg 适配包的 peer 是 `15.0.0`。两个 peer 不可能同时
   满足；6.2.0 的 JS 只用了 `Svg/Rect/Path/Defs/G/LinearGradient/Stop` 这些稳定原语，
   15.0.0 下行为一致，因此安装时用 `--force` 装、`package-lock.json` 固定；
   `npm ci` 实测只打 warning、退出码 0。没有为此换 qrcode-svg 版本。

### 1.4 试过但没采用的版本

- `@react-native-oh-tpl/react-native-svg@13.14.0-0.4.8`（issue 里的备选）：能编过，但它的
  JS 侧只是重新导出 `react-native-svg@13.14.0`，而 har 是旧的 ArkTS/CAPI 混合实现，
  `index.ets` 是 0 字节（不能注册 `SvgPackage`），实际运行时 svg 节点挂上了但**什么都不画**
  （真机截图二维码区域全白，连一个纯色 `Path` 都画不出来），且它的 `toDataURL` 是返回空串的
  stub。所以最后没有停在 13，而是用 overrides 修好依赖解析后用 15。
- `@react-native-oh-tpl/camera-roll@7.8.3-0.1.5` / `7.8.4-rc.2`：见第 4 节，**编译不过**，
  没有接入。

## 2. 鸿蒙接入（照 WebView 的四点）

1. `npm install`：上面三个包；`react-native-svg@15.0.0` 是适配包的上游基线，Android/iOS
   autolinking 需要它作为直接依赖。
2. `harmony/entry/oh-package.json5`：`file:../../node_modules/@react-native-oh-tpl/react-native-svg/harmony/svg.har`。
3. `harmony/entry/src/main/cpp/CMakeLists.txt`：`add_subdirectory(.../src/main/cpp ./svg)`，
   `target_link_libraries(rnoh_app PUBLIC rnoh_svg)`。
4. `harmony/entry/src/main/cpp/PackageProvider.cpp`：`SVGPackage`。
5. ArkTS 侧不用加：15 的 CAPI 组件和 turbo modules 都由 C++ 的 `SVGPackage`
   注册，`harmony/entry/src/main/ets/PackageProvider.ets` 仍然只注册 `WebViewPackage`。
6. `harmony/oh-package.json5`：钉 RNOH `0.72.140` 的 `overrides`（见 1.3）。

没有改 `pages/Index.ets` / `arkTsComponentNames`：svg 15 是 CAPI 组件，不需要 ArkTS
自定义组件注册。

## 3. 实现

| 文件 | 内容 |
| --- | --- |
| `src/qr/qrCode.ts` | 用 `qrcode` 的 `create()` 得到矩阵/版本；空输入和超容量返回提示而不抛异常；`qrLabel` 生成 `版本 N · M×M 模块 + 4 模块静区`；`qrQuietZonePixels` 把 4 个模块换算成 qrcode-svg 要的像素静区 |
| `src/qr/textEncoder.ts` | Hermes（RN 0.72）没有 `TextEncoder`，`qrcode@1.5.4` 直接 `new TextEncoder()`。补一个只实现 `encode()` 的最小 polyfill，否则第一次编码就会抛异常（现象是页面把正常内容误报成「内容过长」） |
| `src/screens/QrCodeScreen.tsx` | 输入框（默认 `https://example.com`）、L/M/Q/H、实时二维码、版本信息、空/超长提示、保存区域 |
| `src/screens/ProductListScreen.tsx` / `App.tsx` | 列表入口「二维码」与 `{kind: 'qr'}` 返回栈页面 |

显示用 `react-native-qrcode-svg`，`quietZone` 传 `4 * CODE_SIZE / moduleCount` 像素，
即四个模块的白边；二维码本体是深色在白色 surface 上，对比度满足扫码。
编码结果由 `qrcode` 单独算一遍只用于版本号和校验，和组件内部是同一个编码器。

## 4. 保存到相册：可用（HarmonyOS，WRITE_IMAGEVIDEO ACL）

需求表里的方案是 `@react-native-oh-tpl/camera-roll`。它在 RNOH 0.72.140 上编译不过：
`7.8.3` / `7.8.4-rc.2` 的 har 都 `import {TM} from '@rnoh/react-native-openharmony/generated/ts'`，
而 `generated/ts` 是 0.77+ 的 codegen 产物。KMP 版已经用鸿蒙自己的 API 走通了保存，
这一单按同一条路径自写 `ImageSave` turbo module，不再依赖 camera-roll，也没有新增
文件系统依赖。

### 4.1 调用链

1. **JS 把矩阵编码成 PNG**（`src/qr/qrPng.ts`）：8-bit 灰度、每行 filter 0、
   zlib stored deflate，带 4 模块静区；PNG 签名、CRC-32、Adler-32 都是纯 JS。
   二维码页和能力页共用它，能力页没有挂载二维码组件也能保存。
2. **`ImageSave` ArkTS 模块**
   （`harmony/entry/src/main/ets/image/ImageSaveTurboModule.ets`）：
   - `checkAccessTokenSync` / `requestPermissionsFromUser(['ohos.permission.WRITE_IMAGEVIDEO'])`
   - base64 → 字节；写到 `context.cacheDir` 的临时文件
   - `photoAccessHelper.getPhotoAccessHelper(context).createAsset(PhotoType.IMAGE, 'png', {title})`
   - `fs.openSync(uri, OpenMode.READ_WRITE)` → `writeSync` → `closeSync`
     （相册 URI 已存在，带 `CREATE`/`TRUNC` 会被拒为 `13900001 Operation not permitted`）
   - **读回相册资源**，校验字节数与 PNG 文件头，都通过才返回成功
   - 删除临时文件
3. **JS 显示结果**：成功 → `已保存到相册`；权限被拒 → 上一批的
   `被拒绝了；这个平台不会再弹框，点「去设置」` 文案 + 一个「去设置」按钮；
   其它失败 → 平台原始 code / message。

`createAsset` 的签名是 `(PhotoType.IMAGE, 'png', {title})`；没有用
`createAssetWithShortTermPermission`（那需要另一个权限
`SHORT_TERM_WRITE_IMAGEVIDEO`）。临时文件只是中间产物，相册里的资产由
`createAsset` 创建。

### 4.2 权限与签名

- `harmony/entry/src/main/module.json5` 声明了 `ohos.permission.WRITE_IMAGEVIDEO`
  （`reason` + `usedScene`，字符串资源 `save_image_reason`）。**声明是运行时申请的前提**：
  只在 profile 里有 ACL、`module.json5` 不声明，`requestPermissionsFromUser` 仍然拿不到。
- 该权限是 `user_grant` + `system_basic`，普通应用只能通过 ACL。**仓库里的
  `build-profile.json5` 仍然保持 `signingConfigs: []`**；本机
  `devecocli signature generate` 生成的 profile 才带
  `acls.allowed-acls: ["ohos.permission.WRITE_IMAGEVIDEO"]`。注意旧的本机 RN
  调试 profile 没有 ACL：这一单在 `module.json5` 声明后重新生成了一份
  `com.example.kmp.rn.harmony` 的调试 profile 再装机（签名材料不进仓库）。
  上架时 AGC 仍会按受限权限的使用场景审核。
- 没有走 `SaveButton` 安全控件：它在纯 ArkTS 页面可用，但 RNOH 0.72 没有把 ArkTS
  安全控件嵌进 RN 视图的现成通路；这一单按 ticket 指定的 ACL 路径实现。
- Android / iOS 没有对应的保存模块，页面会显示
  `ImageSave 模块没有注册（saveImage 不存在）；本实现只接了 HarmonyOS`。
  能力行的「可用」描述的是鸿蒙构建（与「从相册选图」等行的口径一致）。

### 4.3 拒绝权限后的兜底

拒绝后系统不会再次弹框，所以页面不重复申请：

- 行内显示 `被拒绝了；这个平台不会再弹框，点「去设置」在系统设置里打开`；
- 出现「去设置」按钮，调用上一批 `permissions.ts` 同一个原生
  `openPermissionSettings`，内部是 `requestPermissionOnSetting`，打开的是
  `WRITE_IMAGEVIDEO` 的权限设置页（不是设置应用首页）；
- 从设置返回后再点「保存到相册」即可重新走保存；如果用户仍然拒绝，结果仍然如实显示。

## 5. 测试与真机验证


`__tests__/qr.test.ts`（纯 JS，不渲染）：

- L 与 H 的矩阵尺寸不同（H 更大，`size = 17 + 4 * version`）；
- 空输入不生成矩阵，返回提示；
- 相同输入 + 相同级别结果确定（版本、尺寸、矩阵完全一致）；
- 超容量返回「内容过长」并把级别容量写进提示；
- `qrLabel` / `qrQuietZonePixels` / `Utf8TextEncoder` 的字节序。

本单新增的纯 JS / 页面测试：

- `__tests__/qrPng.test.ts`：PNG 签名与尺寸、4 模块静区、黑模块、矩阵不完整和
  非正 scale 的拒绝、scale 夹取、标题时间戳；并用 upng-js 解码后再用 jsqr
  扫回 `https://example.com` 与中文内容；
- `__tests__/imageSave.test.ts`：成功 / 权限拒绝 / 平台失败三种结果、模块缺失、
  空入参、原生 reject、缺 URI、非法结构；
- `__tests__/qrScreen.test.tsx`：保存按钮真实调用 PNG 编码 + 原生模块、成功后
  文案、拒绝后的「去设置」、平台失败原因、模块缺失、空内容禁用按钮；
- `__tests__/permissions.test.ts`：`openAlbumWritePermissionSettings` 走
  `openPermissionSettings('photo_write')`。

全量：`npx tsc --noEmit`、`npx eslint src __tests__`、`npm test -- --ci`
（24 个测试文件、175 个用例通过）。

真机：`FMR0224125000567`（ALN-AL00，HarmonyOS 7.0.0.111 / API 26，1260×2720），
签名 debug HAP（`com.example.kmp.rn.harmony`）安装后逐项操作。证据在
`docs/evidence/qr/`，二维码截图额外用 `zbarimg` 解码验证。

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| 列表页点「二维码」 | 打开二维码页，默认内容 `https://example.com`、纠错 M | `harmony-after-list.png` |
| 默认状态 | 显示 `版本 2 · 25×25 模块 + 4 模块静区`；`zbarimg` 解出 `https://example.com` | `harmony-after-qr-m.png` |
| 切纠错级别 M → H | 变成 `版本 3 · 29×29 模块 + 4 模块静区`；仍解出 `https://example.com` | `harmony-after-qr-h.png` |
| 内容改成 `KMP RN QR 测试 2026` | 二维码即时重算；`zbarimg` 解出该文本 | `harmony-after-qr-content.png` |
| 清空内容 | 显示「请输入要生成二维码的内容」，二维码区域不绘制（截图像素检查无深色模块） | `harmony-after-qr-empty.png` |
| 点「保存到相册」 | 弹系统权限框「允许“KMP RN Demo”修改你的图片和视频？」 | `save/after-qr-permission-dialog.png` |
| 允许后 | 行内显示 `已保存到相册`；临时文件被删除 | `save/after-qr-saved.png` |
| 去系统相册看 | 「今天」里出现新图片；对相册截图跑 `zbarimg` 解出 `https://example.com`，证明相册里真的是可扫的二维码 | `save/after-album-photo.png` |
| 能力页「保存图片到相册」 | 行状态 `可用`，按钮实际写入相册，行内 `已保存到相册（KMP-RN-QR-20261117-182344）` | `save/after-capability-row.png` / `after-capability-saved.png` |
| 拒绝权限 | 行内显示 `被拒绝了；这个平台不会再弹框，点「去设置」在系统设置里打开`，并出现「去设置」 | `save/after-qr-denied.png` |
| 点「去设置」 | 打开系统「图片和视频权限」页（允许写入 / 不允许 / 确定） | `save/after-qr-settings.png` |
| 返回 | 回到列表页 | — |

没有验到的：

- **没有用第二台实体相机实扫**。这里是对真机截图跑 `zbarimg`（同一张图的解码），
  不是相机扫码；第 4 条验收要靠人工用另一台设备扫。
- Android / iOS 只由 CI 编译（Android `:app:assembleDebug`），没有真机运行；
  保存到相册只在 HarmonyOS 实现（第 4 节），Android / iOS 没有对应原生模块。
- 极长内容触发「内容过长」的提示没有在真机上专门造一条数据，只在单元测试里覆盖了
  （设备上的空内容分支已验）。

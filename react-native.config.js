/**
 * Autolinking switchboard.
 *
 * Two of the app's capabilities are its own bridges on every platform
 * (Bluetooth, Wi-Fi, device info, network, permissions, album save, scan); four
 * still ride a third-party library: async-storage, clipboard, image-picker and
 * webview.
 *
 * For those four, `@react-native-oh-tpl/*` is the HarmonyOS adaptation: it ships
 * an ArkTS/har side and **no Android or iOS sources**, so it is excluded from
 * the Android platform here. The upstream packages it wraps do have Android
 * sources and are autolinked as usual — this file must not exclude them.
 *
 * Getting the Android build to link them took one more thing: the libraries
 * decide whether to generate their new-architecture code with
 * `newArchEnabled` from `gradle.properties`. RN 0.86 is bridgeless and always
 * builds the new architecture, so with that flag `false` the libraries skipped
 * codegen while autolinking still pointed its CMake at the missing
 * `android/build/generated/source/codegen/jni` trees. It is `true` now.
 */

/**
 * iOS: three of the four upstream libraries are pinned to versions that predate
 * the React Native dependency reshuffle. `react-native-image-picker@7.0.3`,
 * `react-native-webview@13.10.2` and `@react-native-async-storage/async-storage@1.21.0`
 * all depend on `RCT-Folly`, `RCTRequired` and `RCTTypeSafety`, which React Native
 * merged into `ReactNativeDependencies` in 0.76 — `pod install` stops with
 * 「Unable to find a specification for `RCT-Folly`」.
 *
 * They are excluded from the iOS platform until they are bumped to versions that
 * support 0.76+ (the HarmonyOS adaptations pin these exact versions, so the bump
 * has to be verified on all three platforms at once). The iOS app then reports
 * 「模块没有注册」 on those four capability rows instead of failing to install.
 */
const iosUnavailable = [
  'react-native-image-picker',
  'react-native-webview',
  '@react-native-async-storage/async-storage',
];

const harmonyOnly = [
  '@react-native-oh-tpl/async-storage',
  '@react-native-oh-tpl/clipboard',
  '@react-native-oh-tpl/react-native-image-picker',
  '@react-native-oh-tpl/react-native-webview',
];

const dependencies = {};
for (const name of harmonyOnly) {
  dependencies[name] = {platforms: {android: null}};
}
for (const name of iosUnavailable) {
  dependencies[name] = {...(dependencies[name] ?? {}), platforms: {
    ...(dependencies[name]?.platforms ?? {}),
    ios: null,
  }};
}

module.exports = {
  project: {android: {sourceDir: 'android'}},
  dependencies,
};

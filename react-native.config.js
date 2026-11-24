/**
 * Autolinking switchboard for the four capabilities that still use a
 * third-party library (the platform bridges are the app's own only for
 * Bluetooth, Wi-Fi, device info, network, permissions, album save and scan).
 *
 * `@react-native-oh-tpl/*` ships an ArkTS/har side and no Android or iOS
 * sources, and the upstream libraries those sit on (async-storage, clipboard,
 * image-picker, webview) do not produce new-architecture codegen output under
 * RN 0.86, so their `android/build/generated/source/codegen/jni` trees are
 * missing and the generated autolinking CMake cannot add them.
 *
 * Excluding them from the Android platform keeps the Android build linkable.
 * The cost is stated plainly: on Android those four rows report
 * 「模块没有注册」 instead of pretending to work. HarmonyOS and iOS are
 * unaffected and keep autolinking them.
 */
const androidUnavailable = [
  '@react-native-oh-tpl/async-storage',
  '@react-native-oh-tpl/clipboard',
  '@react-native-oh-tpl/react-native-image-picker',
  '@react-native-oh-tpl/react-native-webview',
  '@react-native-async-storage/async-storage',
  '@react-native-clipboard/clipboard',
  'react-native-image-picker',
  'react-native-webview',
];

const dependencies = {};
for (const name of androidUnavailable) {
  dependencies[name] = {platforms: {android: null}};
}

module.exports = {
  project: {android: {sourceDir: 'android'}},
  dependencies,
};

/**
 * Autolinking overrides for the packages that have both a HarmonyOS adaptation
 * and an official cross-platform build.
 *
 * `@react-native-oh-tpl/react-native-ble-plx` is the HarmonyOS fork: its
 * package.json still claims the upstream `ios`/`android` platforms, but the
 * package ships no `ios/` sources and its podspec points at the missing
 * directory, which makes `pod install` fail. The fork is wired into the
 * HarmonyOS build by hand (`harmony/entry/oh-package.json5`), not by
 * autolinking, so dropping its iOS/Android platforms here only stops the
 * autolinker from picking up a package that cannot build there.
 *
 * The upstream packages are direct dependencies and autolink normally on
 * Android and iOS.
 */
module.exports = {
  dependencies: {
    '@react-native-oh-tpl/react-native-ble-plx': {
      platforms: {
        ios: null,
        android: null,
      },
    },
  },
};

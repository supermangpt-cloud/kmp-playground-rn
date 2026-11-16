module.exports = {
  preset: 'react-native',
  // harmony/ holds the ohpm-installed RNOH package. It ships its own __tests__
  // (for the Hermes toolchain) and must not be collected as this app's tests.
  testPathIgnorePatterns: ['/node_modules/', '/harmony/'],
  // The HarmonyOS WebView package has no `main`/type entry that Jest could
  // resolve (its `react-native` entry is the ArkTS-backed adaptation), so use
  // a small view mock that still exposes onMessage/onShouldStartLoadWithRequest.
  moduleNameMapper: {
    '^@react-native-oh-tpl/react-native-webview$':
      '<rootDir>/__mocks__/react-native-webview-harmony.js',
    // react-native-qrcode-svg renders react-native-svg native elements, which
    // this Jest preset cannot mount. The encoder is tested directly instead.
    '^@react-native-oh-tpl/react-native-qrcode-svg$':
      '<rootDir>/__mocks__/react-native-qrcode-svg.js',
    // vision-camera registers a CAPI view + turbo module at import time and
    // image-picker is an ArkTS turbo module; neither can load in Jest. The
    // mocks expose the props/callbacks the scan page uses.
    '^@react-native-ohos/react-native-vision-camera$':
      '<rootDir>/__mocks__/react-native-vision-camera-harmony.js',
  },
};

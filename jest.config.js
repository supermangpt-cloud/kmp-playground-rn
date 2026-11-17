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
    // The unit tests pin the HarmonyOS behaviour the page was verified on. The
    // platform profiles are plain modules with `.harmony` siblings, which Jest
    // does not resolve by platform; map the bare specifiers to the HarmonyOS
    // files so the suite keeps testing that profile. The Android/iOS profiles
    // are exercised by the type check and the device/simulator runs.
    '^(.*/)?capabilityCatalog$':
      '<rootDir>/src/data/capabilityCatalog.harmony.ts',
    '^(.*/)?permissionCatalog$':
      '<rootDir>/src/native/permissionCatalog.harmony.ts',
    '^(.*/)?directoryCatalog$':
      '<rootDir>/src/native/directoryCatalog.harmony.ts',
  },
};

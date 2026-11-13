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
  },
};

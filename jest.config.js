module.exports = {
  preset: 'react-native',
  // harmony/ holds the ohpm-installed RNOH package. It ships its own __tests__
  // (for the Hermes toolchain) and must not be collected as this app's tests.
  testPathIgnorePatterns: ['/node_modules/', '/harmony/'],
};

module.exports = {
  // RN 0.86 renamed the preset and switched to the automatic JSX runtime, so
  // the old metro-react-native-babel-preset no longer resolves
  // `react/jsx-runtime`.
  presets: ['module:@react-native/babel-preset'],
};

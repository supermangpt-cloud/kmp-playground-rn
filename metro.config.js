/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * The harmony part comes from the official RNOH AwesomeProject example:
 * it maps React Native modules to @react-native-oh/react-native-harmony when
 * bundling for the `harmony` platform.
 *
 * @type {import('metro-config').MetroConfig}
 */

const path = require('path');
const {mergeConfig, getDefaultConfig} = require('@react-native/metro-config');
const {
  createHarmonyMetroConfig,
} = require('@react-native-oh/react-native-harmony/metro.config');

// The RN app never imports the HarmonyOS, Android or iOS native projects.
// Keep Metro's crawler out of their build/oh_modules/Pods trees; otherwise a
// release bundle spends minutes walking hundreds of MB of native sources.
const escaped = dir => path.resolve(__dirname, dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nativeProjectDirs = ['harmony', 'android', 'ios'].map(
  dir => new RegExp(`${escaped(dir)}[\\\\/]`),
);

const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    blockList: nativeProjectDirs,
  },
};

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  createHarmonyMetroConfig({
    reactNativeHarmonyPackageName:
      '@react-native-oh/react-native-harmony',
  }),
  config,
);

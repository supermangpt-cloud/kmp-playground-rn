/**
 * The `@react-native-oh-tpl/*` packages are HarmonyOS-only adaptations: they
 * ship an ArkTS/har side and no Android or iOS sources. RN 0.86's autolinking
 * scans `dependencies` and would otherwise emit `import com.reactnative…
 * .Package` entries into PackageList.java for modules that do not exist,
 * failing the Android build.
 *
 * Android and iOS builds read the upstream libraries through the same JS
 * wrappers; only HarmonyOS needs the adaptation, so opt these out of the other
 * two platforms here.
 */
const harmonyOnly = [
  '@react-native-oh-tpl/async-storage',
  '@react-native-oh-tpl/clipboard',
  '@react-native-oh-tpl/react-native-ble-plx',
  '@react-native-oh-tpl/react-native-image-picker',
  '@react-native-oh-tpl/react-native-webview',
];

const dependencies = {};
for (const name of harmonyOnly) {
  dependencies[name] = {platforms: {android: null, ios: null}};
}

module.exports = {project: {android: {sourceDir: 'android'}}, dependencies};

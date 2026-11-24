/**
 * react-native-webview 13.10.2 predates RN 0.86 and no longer compiles against
 * it: `ReadableMap.getString` is typed `String?` there, so
 * `webView.loadUrl(args.getString(0))` fails with
 * 「Argument type mismatch: actual type is 'String?', but 'String' was expected」.
 *
 * The HarmonyOS adaptation pins this exact upstream version (its own
 * package.json depends on `react-native-webview@13.10.2`), so bumping the
 * library is not on the table — the one call site is made null-safe instead.
 *
 * Run from `postinstall`; it is idempotent and does nothing once the file
 * already carries the fix.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-webview',
  'android',
  'src',
  'main',
  'java',
  'com',
  'reactnativecommunity',
  'webview',
  'RNCWebViewManagerImpl.kt',
);

if (!fs.existsSync(target)) {
  // The Android sources are not installed (a JS-only install); nothing to do.
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');
const broken = 'webView.loadUrl(args.getString(0))';
const fixed = 'webView.loadUrl(args.getString(0) ?: "")';

if (source.includes(fixed)) {
  console.log('patch-rn-webview-android: already applied');
  process.exit(0);
}
if (!source.includes(broken)) {
  console.log('patch-rn-webview-android: call site not found, leaving the file alone');
  process.exit(0);
}

fs.writeFileSync(target, source.replace(broken, fixed));
console.log('patch-rn-webview-android: made loadUrl null-safe');

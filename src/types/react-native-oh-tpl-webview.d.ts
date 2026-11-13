/**
 * Type declarations for the HarmonyOS adaptation package.
 *
 * HAND-WRITTEN: the upstream package does not ship the `index.d.ts` its
 * package.json points at, so TypeScript cannot infer this module. Re-check
 * these declarations whenever the package version changes. The component's
 * public props are the upstream `react-native-webview` ones
 * (`WebView.harmony.tsx` forwards them), so reuse that type rather than
 * duplicating it here.
 */
declare module '@react-native-oh-tpl/react-native-webview' {
  import type {ComponentType} from 'react';
  import type {WebViewProps} from 'react-native-webview';

  export const WebView: ComponentType<WebViewProps>;
  const defaultExport: ComponentType<WebViewProps>;
  export default defaultExport;
}

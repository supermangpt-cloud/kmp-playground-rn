/**
 * Type declarations for the HarmonyOS adaptation package.
 *
 * `@react-native-oh-tpl/react-native-webview@13.10.3` ships `src/*.tsx` and
 * points `typings` at an `index.d.ts` it does not publish, so TypeScript cannot
 * infer the module. The component's public props are the upstream
 * `react-native-webview` ones (`WebView.harmony.tsx` forwards them), so reuse
 * that type rather than duplicating it here.
 */
declare module '@react-native-oh-tpl/react-native-webview' {
  import type {ComponentType} from 'react';
  import type {WebViewProps} from 'react-native-webview';

  export const WebView: ComponentType<WebViewProps>;
  const defaultExport: ComponentType<WebViewProps>;
  export default defaultExport;
}

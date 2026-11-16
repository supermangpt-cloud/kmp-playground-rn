import type { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony';
import { WebViewPackage } from '@react-native-oh-tpl/react-native-webview';

/**
 * Third-party RN packages linked into the app. The list contains the
 * HarmonyOS WebView adaptation; its ArkTS package registers the RNCWebView
 * custom component and its turbo module. Everything else comes from the RNOH
 * core package, which the runtime adds itself.
 */
export function getRNOHPackages(ctx: RNPackageContext): RNPackage[] {
  return [new WebViewPackage(ctx)];
}

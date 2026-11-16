import type { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony';
import { WebViewPackage } from '@react-native-oh-tpl/react-native-webview';
import { ImagePickerViewPackage } from '@react-native-oh-tpl/react-native-image-picker';
import { ScanKitPackage } from './scan/ScanKitPackage';

/**
 * Third-party RN packages linked into the app. The list contains the
 * HarmonyOS WebView adaptation, whose ArkTS package registers the RNCWebView
 * custom component and its turbo module. Everything else comes from the RNOH
 * core package, which the runtime adds itself.
 *
 * react-native-svg 15.0.1-8 registers its CAPI components and turbo modules
 * from C++ (`SVGPackage` in PackageProvider.cpp), so nothing is added here; the
 * app's own custom ArkTS component is still only RNCWebView.
 */
export function getRNOHPackages(ctx: RNPackageContext): RNPackage[] {
  return [
    new WebViewPackage(ctx),
    // react-native-image-picker's HarmonyOS adaptation: the system photo
    // picker returns the chosen image (base64 + cache URI) to JS, where jsqr
    // decodes it without a native decoder.
    new ImagePickerViewPackage(ctx),
    // The app's own Scan Kit bridge: the self-drawn `pages/ScanPage` scanner
    // (`customScan`), the system-scan fallback and native image decoding.
    new ScanKitPackage(ctx),
  ];
}

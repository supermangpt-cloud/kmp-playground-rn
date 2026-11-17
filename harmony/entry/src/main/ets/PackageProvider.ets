import type { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony';
import { WebViewPackage } from '@react-native-oh-tpl/react-native-webview';
import { ImagePickerViewPackage } from '@react-native-oh-tpl/react-native-image-picker';
import { AsyncStoragePackage } from '@react-native-oh-tpl/async-storage';
import { ClipboardPackage } from '@react-native-oh-tpl/clipboard';
import { BlePlxPackage } from '@react-native-oh-tpl/react-native-ble-plx';
import { ScanKitPackage } from './scan/ScanKitPackage';
import { CapabilityProbePackage } from './capabilities/CapabilityProbePackage';

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
    // async-storage's HarmonyOS adaptation: the ArkTS `RNCAsyncStorage` module
    // backs the platform-capability page's local-storage round trip. The C++
    // side (AsyncStoragePackage in PackageProvider.cpp) exposes its methods
    // under the CAPI architecture.
    new AsyncStoragePackage(ctx),
    // clipboard's HarmonyOS adaptation: `RNCClipboard` writes the value the
    // capability page's row reports. Its read is refused by the platform
    // without PasteButton, which the page states instead of hiding.
    new ClipboardPackage(ctx),
    // react-native-ble-plx's HarmonyOS adaptation: the `BlePlx` turbo module
    // over @ohos.bluetooth.ble, behind the capability page's 蓝牙 LE card. It
    // is ArkTS-only, so no C++ package is registered for it.
    new BlePlxPackage(ctx),
    // The app's own Scan Kit bridge: the self-drawn `pages/ScanPage` scanner
    // (`customScan`), the system-scan fallback and native image decoding.
    new ScanKitPackage(ctx),
    // The app's capability probe: `@ohos.deviceInfo`, `@ohos.net.connection`
    // and the storage-directory reads for the platform-capability page.
    new CapabilityProbePackage(ctx),
  ];
}

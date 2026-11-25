import type { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony';
import { WebViewPackage } from '@react-native-oh-tpl/react-native-webview';
import { ImagePickerViewPackage } from '@react-native-oh-tpl/react-native-image-picker';
import { AsyncStoragePackage } from '@react-native-oh-tpl/async-storage';
import { ClipboardPackage } from '@react-native-oh-tpl/clipboard';
import { ScanKitPackage } from './scan/ScanKitPackage';
import { CapabilityProbePackage } from './capabilities/CapabilityProbePackage';
import { ImageSavePackage } from './image/ImageSavePackage';
import { WifiNetworkPackage } from './wifi/WifiNetworkPackage';
import { BluetoothLePackage } from './bluetooth/BluetoothLePackage';
import { ScannerViewPackage } from './scanner/ScannerViewPackage';
import { VideoViewPackage } from './video/VideoViewPackage';

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
    // over @ohos.bluetooth.ble, behind the capability page's 蓝牙 LE card. The
    // har has no C++ spec, so AppPackage adds its method map
    // The app's own Scan Kit bridge: the self-drawn `pages/ScanPage` scanner
    // (`customScan`), the system-scan fallback and native image decoding.
    new ScanKitPackage(ctx),
    // The app's capability probe: `@ohos.deviceInfo`, `@ohos.net.connection`
    // and the storage-directory reads for the platform-capability page.
    new CapabilityProbePackage(ctx),
    // The app's album writer: `photoAccessHelper.createAsset` behind the
    // WRITE_IMAGEVIDEO ACL, used by the QR page's 保存到相册 and the capability
    // page's 保存图片到相册 row. Its C++ method map lives in AppPackage.
    new ImageSavePackage(ctx),
    // The app's Wi-Fi bridge: @ohos.wifiManager behind the WiFi card. Its C++
    // method map lives in AppPackage.
    new WifiNetworkPackage(ctx),
    new BluetoothLePackage(ctx),
    new ScannerViewPackage(ctx),
    new VideoViewPackage(ctx),
  ];
}

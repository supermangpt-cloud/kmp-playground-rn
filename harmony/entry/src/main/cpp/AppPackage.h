#pragma once

#include <memory>
#include <string>

#include "BlePlxTurboModule.h"
#include "CapabilityProbeTurboModule.h"
#include "ImagePickerTurboModule.h"
#include "ImageSaveTurboModule.h"
#include "RNOH/ArkTSTurboModule.h"
#include "ScanKitTurboModule.h"
#include "RNOH/Package.h"
#include "RNOH/TurboModuleFactory.h"

namespace rnoh {

/**
 * Registers the app's ArkTS-only turbo modules on the C++ side.
 *
 * A pure-ArkTS turbo module needs a C++ `Package` delegate on RNOH 0.72: the
 * ArkTS package factory creates the module instance, and this delegate wraps
 * that instance in `ArkTSTurboModule` so `TurboModuleRegistry.getEnforcing`
 * can find it. Core modules such as `KeyboardObserver` are registered the same
 * way in `RNOHCoreTurboModuleFactoryDelegate`.
 *
 * The adapted libraries ship their own C++ packages and delegates, so this one
 * stays as the place for modules that only have an ArkTS implementation: the
 * Scan Kit bridge, image-picker's and ble-plx's method maps.
 */
class AppTurboModuleFactoryDelegate : public TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(
      Context ctx,
      const std::string& name) const override {
    // react-native-image-picker's HarmonyOS adaptation ships the ArkTS module
    // and no C++ spec; this subclass adds the method map the CAPI architecture
    // needs for `launchCamera` / `launchImageLibrary`.
    if (name == "ImagePicker") {
      return std::make_shared<ImagePickerTurboModule>(ctx, name);
    }
    // The app's Scan Kit bridge: native still-image decoding and the system
    // scan page fallback (promise-returning methods).
    if (name == "ScanKit") {
      return std::make_shared<ScanKitTurboModule>(ctx, name);
    }
    // The app's capability probe: the ArkTS calls behind the capability page's
    // device-information, network-status, storage-directory, haptics, share and
    // dynamic-permission rows.
    if (name == "CapabilityProbe") {
      return std::make_shared<CapabilityProbeTurboModule>(ctx, name);
    }
    // react-native-ble-plx's HarmonyOS adaptation ships the `BlePlx` ArkTS
    // module and no C++ spec; this subclass supplies the method map the CAPI
    // architecture needs for the capability page's 蓝牙 LE card.
    if (name == "BlePlx") {
      return std::make_shared<BlePlxTurboModule>(ctx, name);
    }
    // The app's album writer: PNG bytes -> photoAccessHelper.createAsset
    // behind the WRITE_IMAGEVIDEO ACL, used by the QR page and the
    // 保存图片到相册 capability row.
    if (name == "ImageSave") {
      return std::make_shared<ImageSaveTurboModule>(ctx, name);
    }
    return nullptr;
  }
};

class AppPackage : public Package {
 public:
  using Package::Package;

  std::unique_ptr<TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate()
      override {
    return std::make_unique<AppTurboModuleFactoryDelegate>();
  }
};

} // namespace rnoh

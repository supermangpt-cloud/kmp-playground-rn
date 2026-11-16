#pragma once

#include <memory>
#include <string>

#include "ImagePickerTurboModule.h"
#include "RNOH/ArkTSTurboModule.h"
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
 * `vision-camera` and the other adapted libraries ship their own C++ packages
 * and delegates, so this one stays as the place for app modules that only have
 * an ArkTS implementation.
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

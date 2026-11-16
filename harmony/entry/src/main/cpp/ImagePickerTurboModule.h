#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of `react-native-image-picker`'s ArkTS turbo module.
 *
 * On RNOH 0.72's CAPI architecture a turbo module only exposes the methods
 * listed in `methodMap_` (React Native's `TurboModule` host object returns
 * `undefined` for anything else), and an `ArkTSTurboModule` starts with an
 * empty map. image-picker's HarmonyOS har ships the ArkTS implementation but no
 * generated C++ spec, so this class adds the two callback-style entry points:
 * both start the system picker and return immediately, delivering the result
 * through the JS callback passed as the second argument. `ARK_SCHEDULE_*` is
 * the fire-and-forget variant, which fits those `void` methods.
 */
class ImagePickerTurboModule : public ArkTSTurboModule {
 public:
  ImagePickerTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        ARK_SCHEDULE_METHOD_METADATA(launchCamera, 2),
        ARK_SCHEDULE_METHOD_METADATA(launchImageLibrary, 2),
    };
  }
};

} // namespace rnoh

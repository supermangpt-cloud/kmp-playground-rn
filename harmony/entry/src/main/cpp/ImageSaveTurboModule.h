#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of the app's `ImageSave` ArkTS module.
 *
 * `saveImage` returns a Promise, so it uses the async method map entry: the
 * ArkTS implementation resolves with the structured result and RNOH resolves
 * the JS promise with it. The method map is required because React Native's
 * `TurboModule` host object only exposes names listed there under the CAPI
 * architecture (same arrangement as `ScanKit` and `CapabilityProbe`).
 */
class ImageSaveTurboModule : public ArkTSTurboModule {
 public:
  ImageSaveTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        ARK_ASYNC_METHOD_METADATA(saveImage, 2),
    };
  }
};

} // namespace rnoh

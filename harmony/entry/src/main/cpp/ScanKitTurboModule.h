#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of the app's `ScanKit` ArkTS module.
 *
 * `decodeImage` and `startSystemScan` are promise-returning methods, so they use
 * the async method map entry: the ArkTS implementation returns a Promise and
 * RNOH resolves the JS promise with its result. As with `ImagePicker`, the
 * method map is required because React Native's `TurboModule` host object only
 * exposes names listed there under the CAPI architecture.
 */
class ScanKitTurboModule : public ArkTSTurboModule {
 public:
  ScanKitTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        ARK_ASYNC_METHOD_METADATA(decodeImage, 1),
        ARK_ASYNC_METHOD_METADATA(startSystemScan, 0),
    };
  }
};

} // namespace rnoh

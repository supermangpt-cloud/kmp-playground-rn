#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of the app's `ScanKit` ArkTS module.
 *
 * All three methods return a Promise, so they use the async method map entry:
 * the ArkTS implementation returns a Promise and RNOH resolves the JS promise
 * with its result. As with `ImagePicker`, the method map is required because
 * React Native's `TurboModule` host object only exposes names listed there
 * under the CAPI architecture.
 *
 * `startScanner` pushes the self-drawn `pages/ScanPage` ArkTS page (Scan Kit
 * `customScan`), `startSystemScanner` is the separate system-scanning-UI
 * fallback, and `decodeImage` is the native still-image decoder.
 */
class ScanKitTurboModule : public ArkTSTurboModule {
 public:
  ScanKitTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        ARK_ASYNC_METHOD_METADATA(decodeImage, 1),
        ARK_ASYNC_METHOD_METADATA(startScanner, 0),
        ARK_ASYNC_METHOD_METADATA(startSystemScanner, 0),
    };
  }
};

} // namespace rnoh

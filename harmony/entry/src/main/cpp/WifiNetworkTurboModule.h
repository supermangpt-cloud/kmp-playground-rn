#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of the app's `WifiNetwork` ArkTS module.
 *
 * The three methods return Promises, so they use the async method map entries:
 * the ArkTS implementation resolves with structured payloads and RNOH resolves
 * the JS promises with them. The method map is required because React Native's
 * `TurboModule` host object only exposes names listed there under the CAPI
 * architecture (same arrangement as `ImageSave` and `CapabilityProbe`).
 */
class WifiNetworkTurboModule : public ArkTSTurboModule {
 public:
  WifiNetworkTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        ARK_ASYNC_METHOD_METADATA(scan, 0),
        ARK_ASYNC_METHOD_METADATA(connect, 3),
        ARK_ASYNC_METHOD_METADATA(currentSsid, 0),
    };
  }
};

} // namespace rnoh

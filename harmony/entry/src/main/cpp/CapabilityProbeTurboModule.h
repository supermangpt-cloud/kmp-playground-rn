#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of the app's `CapabilityProbe` ArkTS module.
 *
 * The module only exists in ArkTS (`CapabilityProbeTurboModule.ets`); the CAPI
 * architecture exposes exactly the names listed here, so each JS-visible method
 * needs an entry. All of them return a Promise, which is what
 * `ARK_ASYNC_METHOD_METADATA` describes.
 *
 * `readDeviceInfo` takes no argument, `readNetworkStatus` reads the current
 * state on every call, `readDirectories` takes the boolean that says whether
 * the explicit 刷新 press may ask for the two public-directory permissions,
 * `vibrateHaptic` takes the strength, `shareText` takes the text, and the three
 * permission methods take the permission id.
 */
class CapabilityProbeTurboModule : public ArkTSTurboModule {
 public:
  CapabilityProbeTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        ARK_ASYNC_METHOD_METADATA(readDeviceInfo, 0),
        ARK_ASYNC_METHOD_METADATA(readNetworkStatus, 0),
        ARK_ASYNC_METHOD_METADATA(readDirectories, 1),
        ARK_ASYNC_METHOD_METADATA(vibrateHaptic, 1),
        ARK_ASYNC_METHOD_METADATA(shareText, 1),
        ARK_ASYNC_METHOD_METADATA(readPermissionState, 1),
        ARK_ASYNC_METHOD_METADATA(requestPermission, 1),
        ARK_ASYNC_METHOD_METADATA(openPermissionSettings, 1),
    };
  }
};

} // namespace rnoh

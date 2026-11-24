#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of the app's `BluetoothLe` ArkTS module.
 *
 * Written here instead of pulling the adapted ble-plx har: that har's prebuilt
 * C++ was built against the RNOH 0.72 codegen and could not be rebuilt against
 * 0.86.
 *
 * The method map is required because React Native's `TurboModule` host object
 * only exposes names listed there under the CAPI architecture (same
 * arrangement as `WifiNetwork`, `ImageSave` and `CapabilityProbe`).
 *
 * `startScan` and `connect` return Promises, so they use the async entries;
 * the rest are synchronous so the page can poll the discovered list and read
 * the adapter state without crossing the boundary asynchronously.
 */
class BluetoothLeTurboModule : public ArkTSTurboModule {
 public:
  BluetoothLeTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        ARK_ASYNC_METHOD_METADATA(startScan, 0),
        ARK_METHOD_METADATA(stopScan, 0),
        ARK_METHOD_METADATA(getDevices, 0),
        ARK_ASYNC_METHOD_METADATA(connect, 1),
        ARK_METHOD_METADATA(disconnect, 1),
        ARK_METHOD_METADATA(isConnected, 1),
        ARK_METHOD_METADATA(getState, 0),
    };
  }
};

} // namespace rnoh

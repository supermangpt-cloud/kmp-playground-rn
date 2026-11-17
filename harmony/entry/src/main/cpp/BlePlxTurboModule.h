#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of `react-native-ble-plx`'s ArkTS turbo module (`BlePlx`).
 *
 * The HarmonyOS adaptation of the library ships the ArkTS implementation
 * (`rn_bleplx`, over `@ohos.bluetooth.ble`) but no generated C++ spec. On
 * RNOH 0.72's CAPI architecture a turbo module only exposes the methods listed
 * in `methodMap_` (the host object returns `undefined` for anything else), and
 * `TurboModuleFactory` refuses a module that exists on the ArkTS side but has
 * no C++ counterpart ("Couldn't find Turbo Module 'BlePlx' on the CPP side.").
 * This class is that counterpart: it adds no behaviour, only the method map.
 *
 * The map mirrors the module's own public methods so the whole library surface
 * is reachable, not just the scan/connect calls the capability page makes.
 * Methods returning a Promise use `ARK_ASYNC_METHOD_METADATA`; the void ones
 * (`createClient`, the RN event-emitter pair) use the fire-and-forget variant.
 */
class BlePlxTurboModule : public ArkTSTurboModule {
 public:
  BlePlxTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        // RN's NativeEventEmitter protocol and client lifecycle (void).
        ARK_SCHEDULE_METHOD_METADATA(addListener, 1),
        ARK_SCHEDULE_METHOD_METADATA(removeListeners, 1),
        ARK_SCHEDULE_METHOD_METADATA(createClient, 1),
        // Promise-returning library API.
        ARK_ASYNC_METHOD_METADATA(destroyClient, 0),
        ARK_ASYNC_METHOD_METADATA(cancelTransaction, 1),
        ARK_ASYNC_METHOD_METADATA(setLogLevel, 1),
        ARK_ASYNC_METHOD_METADATA(logLevel, 0),
        ARK_ASYNC_METHOD_METADATA(enable, 1),
        ARK_ASYNC_METHOD_METADATA(disable, 1),
        ARK_ASYNC_METHOD_METADATA(state, 0),
        ARK_ASYNC_METHOD_METADATA(startDeviceScan, 2),
        ARK_ASYNC_METHOD_METADATA(stopDeviceScan, 0),
        ARK_ASYNC_METHOD_METADATA(requestConnectionPriorityForDevice, 3),
        ARK_ASYNC_METHOD_METADATA(readRSSIForDevice, 2),
        ARK_ASYNC_METHOD_METADATA(requestMTUForDevice, 3),
        ARK_ASYNC_METHOD_METADATA(devices, 1),
        ARK_ASYNC_METHOD_METADATA(connectedDevices, 1),
        ARK_ASYNC_METHOD_METADATA(connectToDevice, 2),
        ARK_ASYNC_METHOD_METADATA(cancelDeviceConnection, 1),
        ARK_ASYNC_METHOD_METADATA(isDeviceConnected, 1),
        ARK_ASYNC_METHOD_METADATA(discoverAllServicesAndCharacteristicsForDevice, 2),
        ARK_ASYNC_METHOD_METADATA(servicesForDevice, 1),
        ARK_ASYNC_METHOD_METADATA(characteristicsForDevice, 2),
        ARK_ASYNC_METHOD_METADATA(characteristicsForService, 1),
        ARK_ASYNC_METHOD_METADATA(descriptorsForDevice, 3),
        ARK_ASYNC_METHOD_METADATA(descriptorsForService, 2),
        ARK_ASYNC_METHOD_METADATA(descriptorsForCharacteristic, 1),
        ARK_ASYNC_METHOD_METADATA(readCharacteristicForDevice, 4),
        ARK_ASYNC_METHOD_METADATA(readCharacteristicForService, 3),
        ARK_ASYNC_METHOD_METADATA(readCharacteristic, 2),
        ARK_ASYNC_METHOD_METADATA(writeCharacteristicForDevice, 6),
        ARK_ASYNC_METHOD_METADATA(writeCharacteristicForService, 5),
        ARK_ASYNC_METHOD_METADATA(writeCharacteristic, 4),
        ARK_ASYNC_METHOD_METADATA(monitorCharacteristicForDevice, 4),
        ARK_ASYNC_METHOD_METADATA(monitorCharacteristicForService, 3),
        ARK_ASYNC_METHOD_METADATA(monitorCharacteristic, 2),
        ARK_ASYNC_METHOD_METADATA(readDescriptorForDevice, 5),
        ARK_ASYNC_METHOD_METADATA(readDescriptorForService, 4),
        ARK_ASYNC_METHOD_METADATA(readDescriptorForCharacteristic, 3),
        ARK_ASYNC_METHOD_METADATA(readDescriptor, 2),
        ARK_ASYNC_METHOD_METADATA(writeDescriptorForDevice, 6),
        ARK_ASYNC_METHOD_METADATA(writeDescriptorForService, 5),
        ARK_ASYNC_METHOD_METADATA(writeDescriptorForCharacteristic, 4),
        ARK_ASYNC_METHOD_METADATA(writeDescriptor, 3),
    };
  }
};

} // namespace rnoh

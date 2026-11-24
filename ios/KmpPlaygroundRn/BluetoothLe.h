//
//  BluetoothLe.h
//  KmpPlaygroundRn
//
//  iOS face of the app's own Bluetooth LE bridge, the counterpart of the
//  HarmonyOS ArkTS module and the Android `BluetoothLeModule`. Same method
//  names and payload keys, so `src/native/bluetoothLe.ts` stays one file.
//
#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

@interface BluetoothLe : NSObject <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END

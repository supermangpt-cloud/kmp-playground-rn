//
//  CapabilityProbe.h
//  KmpPlaygroundRn
//
//  The iOS side of the platform-capability page: the same `CapabilityProbe`
//  module name the HarmonyOS build registers, so the JS wrappers in
//  `src/native/*.ts` keep calling one name on every platform.
//
//  RN 0.72 old architecture only: a plain `RCTBridgeModule`, no TurboModule
//  codegen.
//

#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Device information, the current network transport, the storage directories,
 * one haptic tap, the system share panel and the eight runtime permissions of
 * the 动态权限 card.
 *
 * Every method is a promise; the permission ones resolve one of `granted`,
 * `denied` or `notDetermined`, exactly the three states the JS side accepts.
 */
@interface CapabilityProbe : NSObject <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END

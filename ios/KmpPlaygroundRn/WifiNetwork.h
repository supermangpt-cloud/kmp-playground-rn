//
//  WifiNetwork.h
//  KmpPlaygroundRn
//
//  The iOS side of the `WifiNetwork` module. iOS does not let an ordinary app
//  scan nearby access points, read the current SSID or join a network, so this
//  module keeps the same three methods and payload shapes as the HarmonyOS
//  build and reports the platform limitation instead of inventing results.
//

#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * `scan`, `currentSsid` and `connect`, with the same payload keys the JS
 * wrapper validates. All three answers are values, not rejections: the row has
 * to print the reason, and a rejection would be flattened into one Error.
 */
@interface WifiNetwork : NSObject <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END

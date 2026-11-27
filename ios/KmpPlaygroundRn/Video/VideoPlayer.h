#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The JS-facing half of the video on iOS.
 *
 * The same method names as the Android and HarmonyOS modules, so `src/native/video.ts`
 * is platform-neutral. Playback state is polled with `getState` rather than
 * pushed, matching the other platforms.
 */
@interface VideoPlayer : NSObject <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END

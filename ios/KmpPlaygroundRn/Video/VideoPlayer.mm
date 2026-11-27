#import "VideoPlayer.h"

#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>

#import "VideoSession.h"

@implementation VideoPlayer

RCT_EXPORT_MODULE(VideoPlayer)

RCT_EXPORT_METHOD(open:(NSString *)playerId url:(NSString *)url)
{
  [[VideoSession shared] openPlayerId:playerId url:url];
}

RCT_EXPORT_METHOD(getState:(NSString *)playerId
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject)
{
  resolve([[VideoSession shared] stateForPlayerId:playerId]);
}

RCT_EXPORT_METHOD(setPaused:(NSString *)playerId paused:(BOOL)paused)
{
  [[VideoSession shared] setPaused:paused playerId:playerId];
}

RCT_EXPORT_METHOD(seekTo:(NSString *)playerId positionMs:(double)positionMs)
{
  [[VideoSession shared] seekTo:positionMs playerId:playerId];
}

RCT_EXPORT_METHOD(close:(NSString *)playerId)
{
  [[VideoSession shared] closePlayerId:playerId];
}

RCT_EXPORT_METHOD(isPipSupported:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  // Implemented in a follow-up: needs AVPictureInPictureController plus the
  // audio background mode, which the Android and HarmonyOS ports also required.
  resolve(@NO);
}

RCT_EXPORT_METHOD(isInPip:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  resolve(@NO);
}

RCT_EXPORT_METHOD(enterPip)
{
  // Same as above: video PiP on iOS arrives with AVPictureInPictureController.
}

RCT_EXPORT_METHOD(setFullscreen:(BOOL)fullscreen)
{
  // Fullscreen is the next step as well; it needs a presented controller so the
  // page's own layout is not disturbed.
}

@end

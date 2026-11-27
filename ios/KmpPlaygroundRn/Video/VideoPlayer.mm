#import "VideoPlayer.h"

#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>

#import "FullscreenVideoViewController.h"
#import "VideoSession.h"

#import <React/RCTUtils.h>

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
  resolve(@([[VideoSession shared] isPipSupported]));
}

RCT_EXPORT_METHOD(isInPip:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  resolve(@([[VideoSession shared] isInPip]));
}

RCT_EXPORT_METHOD(enterPip)
{
  [[VideoSession shared] startPip];
}

RCT_EXPORT_METHOD(setFullscreen:(BOOL)fullscreen)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *root = RCTPresentedViewController();
    if (root == nil) {
      return;
    }
    if (fullscreen) {
      if ([root.presentedViewController isKindOfClass:[FullscreenVideoViewController class]]) {
        return;
      }
      FullscreenVideoViewController *controller = [[FullscreenVideoViewController alloc] init];
      controller.modalPresentationStyle = UIModalPresentationFullScreen;
      // The status bar belongs to the presenting controller otherwise, and it
      // stayed visible over the video.
      controller.modalPresentationCapturesStatusBarAppearance = YES;
      __weak UIViewController *weakRoot = root;
      controller.onClose = ^{
        [VideoSession shared].isFullscreen = NO;
        [weakRoot dismissViewControllerAnimated:YES completion:nil];
      };
      [VideoSession shared].isFullscreen = YES;
      [root presentViewController:controller animated:YES completion:nil];
    } else if ([root.presentedViewController isKindOfClass:[FullscreenVideoViewController class]]) {
      [VideoSession shared].isFullscreen = NO;
      [root dismissViewControllerAnimated:YES completion:nil];
    }
  });
}

@end

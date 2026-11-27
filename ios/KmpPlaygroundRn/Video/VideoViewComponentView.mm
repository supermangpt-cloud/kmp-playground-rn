#import "VideoViewComponentView.h"

#import <AVFoundation/AVFoundation.h>

#import "VideoSession.h"

@implementation VideoViewComponentView {
  AVPlayerLayer *_playerLayer;
}

+ (NSString *)componentName
{
  return @"VideoView";
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _playerLayer = [AVPlayerLayer layer];
    _playerLayer.videoGravity = AVLayerVideoGravityResizeAspect;
    _playerLayer.frame = self.bounds;
    [self.layer addSublayer:_playerLayer];
  }
  return self;
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _playerLayer.frame = self.bounds;
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [[VideoSession shared] attachLayer:_playerLayer];
  } else {
    [[VideoSession shared] detachLayer:_playerLayer];
  }
}

@end

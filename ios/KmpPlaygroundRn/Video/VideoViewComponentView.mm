#import "VideoViewComponentView.h"

#import <AVFoundation/AVFoundation.h>
#import <ReactCodegen/react/renderer/components/KmpPlaygroundRnSpec/ComponentDescriptors.h>

using namespace facebook::react;

#import "VideoSession.h"

@implementation VideoViewComponentView {
  AVPlayerLayer *_playerLayer;
}

+ (NSString *)componentName
{
  return @"VideoView";
}

/**
 * Registering a view class is what puts the component's descriptor into the
 * registry; without this the mounting layer throws in `createNode` for every
 * `VideoView` the page renders.
 */
+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<VideoViewComponentDescriptor>();
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

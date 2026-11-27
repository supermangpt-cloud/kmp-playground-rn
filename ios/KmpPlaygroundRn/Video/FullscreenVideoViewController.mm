#import "FullscreenVideoViewController.h"

#import <AVFoundation/AVFoundation.h>

#import "VideoSession.h"

@implementation FullscreenVideoViewController {
  AVPlayerLayer *_playerLayer;
}

- (void)viewDidLoad
{
  [super viewDidLoad];
  self.view.backgroundColor = [UIColor blackColor];

  _playerLayer = [AVPlayerLayer layer];
  _playerLayer.player = [VideoSession shared].player;
  _playerLayer.videoGravity = AVLayerVideoGravityResizeAspect;
  _playerLayer.frame = self.view.bounds;
  [self.view.layer addSublayer:_playerLayer];

  UIButton *close = [UIButton buttonWithType:UIButtonTypeSystem];
  [close setTitle:@"✕" forState:UIControlStateNormal];
  [close setTitleColor:[UIColor whiteColor] forState:UIControlStateNormal];
  close.titleLabel.font = [UIFont systemFontOfSize:28 weight:UIFontWeightSemibold];
  // Below the status bar: a 44pt button at y=16 sits inside it and the taps there
  // never reached the button.
  close.frame = CGRectMake(12, 64, 56, 56);
  [close addTarget:self action:@selector(closeTapped) forControlEvents:UIControlEventTouchUpInside];
  [self.view addSubview:close];
}

- (void)viewDidLayoutSubviews
{
  [super viewDidLayoutSubviews];
  _playerLayer.frame = self.view.bounds;
  // Rotate the video with the screen: AVPlayerLayer is not layout-driven.
  _playerLayer.frame = self.view.bounds;
}

- (void)viewWillAppear:(BOOL)animated
{
  [super viewWillAppear:animated];
  // The status bar stays visible in fullscreen: the app has to keep
  // `UIViewControllerBasedStatusBarAppearance = NO` (React Native's
  // RCTStatusBarManager asserts on it), which makes `prefersStatusBarHidden`
  // ineffective, and `setStatusBarHidden:` is a no-op since iOS 13.
  [[VideoSession shared] attachLayer:_playerLayer];
}

- (void)viewWillDisappear:(BOOL)animated
{
  [super viewWillDisappear:animated];

  [[VideoSession shared] detachLayer:_playerLayer];
}

- (BOOL)prefersStatusBarHidden
{
  return YES;
}

- (UIInterfaceOrientationMask)supportedInterfaceOrientations
{
  return UIInterfaceOrientationMaskLandscape | UIInterfaceOrientationMaskPortrait;
}

- (void)closeTapped
{
  if (self.onClose != nil) {
    self.onClose();
  }
}

@end

#import "VideoSession.h"

#import <AVKit/AVKit.h>

@interface VideoSession () <AVPictureInPictureControllerDelegate>
@property (nonatomic, strong, nullable) AVPlayer *player;
@property (nonatomic, strong, nullable) AVPlayerItem *item;
@property (nonatomic, copy) NSString *playerId;
@property (nonatomic, copy) NSString *url;
@property (nonatomic, strong, nullable) NSString *errorMessage;
@property (nonatomic, assign) BOOL wantPlaying;
@property (nonatomic, strong) NSMutableArray<AVPlayerLayer *> *layers;
@property (nonatomic, strong, nullable) AVPictureInPictureController *pipController;
@property (nonatomic, assign) BOOL inPip;
@end

@implementation VideoSession

+ (instancetype)shared
{
  static VideoSession *shared;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    shared = [[VideoSession alloc] init];
  });
  return shared;
}

- (instancetype)init
{
  if (self = [super init]) {
    _wantPlaying = YES;
    _layers = [NSMutableArray array];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(itemDidPlayToEnd:)
                                                 name:AVPlayerItemDidPlayToEndTimeNotification
                                               object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)openPlayerId:(NSString *)playerId url:(NSString *)url
{
  if (self.player != nil && [self.playerId isEqualToString:playerId] && [self.url isEqualToString:url]) {
    return;
  }
  [self closePlayerId:self.playerId];

  self.playerId = playerId;
  self.url = url;
  self.errorMessage = nil;
  self.wantPlaying = YES;

  NSURL *mediaURL = [NSURL URLWithString:url];
  if (mediaURL == nil) {
    self.errorMessage = @"视频地址无效";
    return;
  }
  AVPlayerItem *item = [AVPlayerItem playerItemWithURL:mediaURL];
  AVPlayer *player = [AVPlayer playerWithPlayerItem:item];
  player.actionAtItemEnd = AVPlayerActionAtItemEndPause;
  if (@available(iOS 10.0, *)) {
    player.automaticallyWaitsToMinimizeStalling = YES;
  }
  self.item = item;
  self.player = player;

  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryPlayback error:nil];
  [session setActive:YES error:nil];

  for (AVPlayerLayer *layer in self.layers) {
    layer.player = player;
  }

  __weak VideoSession *weakSelf = self;
  [item addObserver:self forKeyPath:@"status" options:NSKeyValueObservingOptionNew context:nil];
  (void)weakSelf;

  [player play];
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary *)change
                       context:(void *)context
{
  if ([keyPath isEqualToString:@"status"] && object == self.item) {
    if (self.item.status == AVPlayerItemStatusFailed && self.item.error != nil) {
      self.errorMessage = self.item.error.localizedDescription;
    } else if (self.item.status == AVPlayerItemStatusReadyToPlay && self.wantPlaying) {
      [self.player play];
    }
    return;
  }
  [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}

- (void)itemDidPlayToEnd:(NSNotification *)note
{
  // Leave the frame in place so the page can show 重播.
}

- (NSDictionary *)stateForPlayerId:(NSString *)playerId
{
  AVPlayer *player = self.player;
  BOOL found = player != nil && [playerId isEqualToString:self.playerId];
  if (!found) {
    return @{
      @"found" : @NO,
      @"position" : @0,
      @"duration" : @0,
      @"playing" : @NO,
      @"ended" : @NO,
      @"buffering" : @NO,
      @"error" : [NSNull null],
      @"fullscreen" : @(self.isFullscreen),
    };
  }
  CMTime position = player.currentTime;
  CMTime duration = self.item.duration;
  double positionMs = CMTIME_IS_NUMERIC(position) ? CMTimeGetSeconds(position) * 1000.0 : 0;
  double durationMs = CMTIME_IS_NUMERIC(duration) ? CMTimeGetSeconds(duration) * 1000.0 : 0;
  BOOL ended = self.item.status == AVPlayerItemStatusReadyToPlay &&
      CMTimeCompare(position, duration) >= 0 && durationMs > 0;
  BOOL buffering = self.item.status != AVPlayerItemStatusReadyToPlay;
  return @{
    @"found" : @YES,
    @"position" : @(positionMs),
    @"duration" : @(durationMs),
    @"playing" : @(player.rate > 0),
    @"ended" : @(ended),
    @"buffering" : @(buffering),
    @"error" : self.errorMessage == nil ? (id)[NSNull null] : (id)self.errorMessage,
    @"fullscreen" : @(self.isFullscreen),
  };
}

- (void)setPaused:(BOOL)paused playerId:(NSString *)playerId
{
  if (![playerId isEqualToString:self.playerId]) {
    return;
  }
  self.wantPlaying = !paused;
  if (paused) {
    [self.player pause];
  } else if (self.item.status == AVPlayerItemStatusReadyToPlay) {
    if (self.item.duration.value > 0 &&
        CMTimeCompare(self.player.currentTime, self.item.duration) >= 0) {
      [self.player seekToTime:kCMTimeZero];
    }
    [self.player play];
  }
}

- (void)seekTo:(double)positionMs playerId:(NSString *)playerId
{
  if (![playerId isEqualToString:self.playerId]) {
    return;
  }
  CMTime target = CMTimeMakeWithSeconds(positionMs / 1000.0, NSEC_PER_SEC);
  [self.player seekToTime:target toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero];
}

- (void)attachLayer:(AVPlayerLayer *)layer
{
  if ([self.layers containsObject:layer]) {
    return;
  }
  [self.layers addObject:layer];
  layer.player = self.player;
  [self ensurePipControllerForLayer:layer];
}

- (BOOL)isPipSupported
{
  return [AVPictureInPictureController isPictureInPictureSupported];
}

- (BOOL)isInPip
{
  return self.inPip;
}

- (void)startPip
{
  AVPictureInPictureController *controller = self.pipController;
  if (controller == nil) {
    for (AVPlayerLayer *layer in self.layers) {
      if (layer.player != nil) {
        [self ensurePipControllerForLayer:layer];
        controller = self.pipController;
        break;
      }
    }
  }
  if (controller != nil && !controller.isPictureInPictureActive) {
    [controller startPictureInPicture];
  }
}

- (void)stopPip
{
  if (self.pipController.isPictureInPictureActive) {
    [self.pipController stopPictureInPicture];
  }
}

- (void)ensurePipControllerForLayer:(AVPlayerLayer *)layer
{
  if (self.pipController != nil || layer.player == nil || ![self isPipSupported]) {
    return;
  }
  self.pipController = [[AVPictureInPictureController alloc] initWithPlayerLayer:layer];
  self.pipController.delegate = self;
}

- (void)pictureInPictureControllerDidStartPictureInPicture:(AVPictureInPictureController *)controller
{
  self.inPip = YES;
}

- (void)pictureInPictureControllerDidStopPictureInPicture:(AVPictureInPictureController *)controller
{
  self.inPip = NO;
}

- (void)detachLayer:(AVPlayerLayer *)layer
{
  [self.layers removeObject:layer];
  if (layer.player == self.player) {
    layer.player = nil;
  }
}

- (void)closePlayerId:(NSString *)playerId
{
  if (![playerId isEqualToString:self.playerId]) {
    return;
  }
  if (self.item != nil) {
    @try {
      [self.item removeObserver:self forKeyPath:@"status"];
    } @catch (NSException *exception) {
    }
  }
  [self.player pause];
  for (AVPlayerLayer *layer in self.layers) {
    layer.player = nil;
  }
  self.player = nil;
  self.item = nil;
  self.playerId = @"";
  self.url = @"";
}

@end

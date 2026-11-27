#import <AVFoundation/AVFoundation.h>

#import <AVKit/AVKit.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The video player, kept outside the view that shows it.
 *
 * Same arrangement as the Android and HarmonyOS ports: React Native may rebuild
 * the view freely, so the `AVPlayer` lives here and a view only borrows its
 * layer. That is what keeps playback continuous when the page comes back.
 */
@interface VideoSession : NSObject

+ (instancetype)shared;

/** The player every attached layer draws into; nil before the first open. */
@property (nonatomic, readonly, nullable) AVPlayer *player;

/** Opens the media for this page; re-opening the same pair is a no-op. */
- (void)openPlayerId:(NSString *)playerId url:(NSString *)url;

/** Snapshot for the page's 400ms poll. */
- (NSDictionary *)stateForPlayerId:(NSString *)playerId;

- (void)setPaused:(BOOL)paused playerId:(NSString *)playerId;
- (void)seekTo:(double)positionMs playerId:(NSString *)playerId;

/** A view took the layer (or gave it back); the media stays open either way. */
- (void)attachLayer:(AVPlayerLayer *)layer;
- (void)detachLayer:(AVPlayerLayer *)layer;

- (void)closePlayerId:(NSString *)playerId;

/** Picture-in-picture: supported by the device and currently on screen. */
- (BOOL)isPipSupported;
- (BOOL)isInPip;
- (void)startPip;

/** Whether the presented fullscreen player is up; the page reads it in getState. */
@property (nonatomic, assign) BOOL isFullscreen;
- (void)stopPip;

@end

NS_ASSUME_NONNULL_END

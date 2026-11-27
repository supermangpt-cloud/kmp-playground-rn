#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The fullscreen player.
 *
 * A presented controller rather than a resized page view: the page's own layout
 * (and React Native's mounting) stays untouched, and rotation only affects this
 * controller.
 */
@interface FullscreenVideoViewController : UIViewController

/** Called when the user taps ✕ or swipes the player away. */
@property (nonatomic, copy, nullable) void (^onClose)(void);

@end

NS_ASSUME_NONNULL_END

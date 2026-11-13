#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// How long the native splash stays before the React Native root view is shown.
/// Mirrors SplashActivity.SPLASH_MILLIS on Android and Splash.ets on HarmonyOS.
extern const NSInteger SPLASH_MILLIS;

/// Native launch screen (logo and app name). It continues the system
/// LaunchScreen.storyboard so there is no white flash between the two.
@interface SplashViewController : UIViewController

@end

NS_ASSUME_NONNULL_END

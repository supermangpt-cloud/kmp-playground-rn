#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

#import "SplashViewController.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"KmpPlaygroundRn";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  BOOL launched = [super application:application didFinishLaunchingWithOptions:launchOptions];

  // Let RCTAppDelegate build the React Native root controller first (so the
  // bridge and bundle start loading), then put the native splash on screen and
  // swap back after SPLASH_MILLIS. The swap replaces the root controller, so
  // nothing leads back to the splash.
  UIViewController *reactRootViewController = self.window.rootViewController;
  if (reactRootViewController != nil) {
    self.window.rootViewController = [[SplashViewController alloc] init];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(SPLASH_MILLIS * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
      [UIView transitionWithView:self.window
                        duration:0.2
                         options:UIViewAnimationOptionTransitionCrossDissolve
                      animations:^{
                        self.window.rootViewController = reactRootViewController;
                      }
                      completion:nil];
    });
  }

  return launched;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end

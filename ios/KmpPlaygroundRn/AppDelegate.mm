#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

#import "SplashViewController.h"
#import "Video/VideoViewComponentView.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"KmpPlaygroundRn";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  // The window is created by SceneDelegate (UIScene lifecycle); the legacy
  // app-delegate window would crash on iOS 26+.
  self.automaticallyLoadReactNativeWindow = NO;
  BOOL launched = [super application:application didFinishLaunchingWithOptions:launchOptions];

  return launched;
}

// React Native 0.86's factory asks its delegate for `bundleURL`; the 0.72
// `sourceURLForBridge:` below is no longer consulted, and without this the
// default delegate raises NSException on launch.
// Fabric needs a view class for every component the JS asks for; without this the
// video page renders 「Unimplemented component: <VideoView>」.
- (NSDictionary<NSString *, Class<RCTComponentViewProtocol>> *)thirdPartyFabricComponents
{
  NSMutableDictionary *components = [[super thirdPartyFabricComponents] mutableCopy];
  if (components == nil) {
    components = [NSMutableDictionary dictionary];
  }
  components[@"VideoView"] = [VideoViewComponentView class];
  NSLog(@"[KmpDebug] thirdPartyFabricComponents -> %@", components.allKeys);
  return components;
}

- (NSURL *)bundleURL
{
  NSLog(@"[KmpDebug] AppDelegate.bundleURL called");
#if DEBUG
  // Explicit Metro URL: `jsBundleURLForBundleRoot:` resolved to nil on the
  // simulator, which surfaced as 「No script URL provided」 and a white screen.
  return [NSURL URLWithString:@"http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

@end

#pragma mark - Scene lifecycle

/**
 * Owns the window since iOS adopted UIScene (iOS 26 crashes without it).
 *
 * The splash hand-off that used to live in the app delegate is here now: the
 * window starts on `SplashViewController` and cross-dissolves to the React
 * Native root after SPLASH_MILLIS.
 */
@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  UIWindow *window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  self.window = window;

  // Start React Native in this window (0.86 API). The splash hand-off is gone
  // for now: `startReactNativeWithModuleName:` installs the root controller
  // asynchronously, so reading `window.rootViewController` here returned nil and
  // the window stayed on the (white) splash forever.
  // Use the factory the app delegate already owns. Building a second one (with
  // `initWithDelegate:`) made `bundleURL` reachable but left two factories in
  // play: the app showed 「Loading from Metro...」 and Metro never received a
  // request.
  RCTReactNativeFactory *factory = appDelegate.reactNativeFactory;
  @try {
    NSLog(@"[KmpDebug] factory delegate = %@",
          NSStringFromClass([[factory valueForKey:@"delegate"] class]));
  } @catch (NSException *e) {
    NSLog(@"[KmpDebug] delegate KVC failed: %@", e.reason);
  }
  [factory startReactNativeWithModuleName:appDelegate.moduleName ?: @"KmpPlaygroundRn"
                                 inWindow:window];
  [window makeKeyAndVisible];
}

@end

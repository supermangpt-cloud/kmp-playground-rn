//
//  CapabilityProbe.mm
//  KmpPlaygroundRn
//
//  iOS implementation of the HarmonyOS `CapabilityProbe` turbo module the
//  platform-capability page already talks to. The payload shapes here are the
//  ones `src/native/{deviceInfo,networkStatus,storageDirectories,haptics,
//  systemShare,permissions}.ts` validate, so the JS side stays unchanged.
//
//  All methods are called by RN on a background method queue; everything that
//  touches UIKit, CLLocationManager or CBCentralManager hops to the main queue
//  first. The permission methods always resolve one of `granted`, `denied` or
//  `notDetermined`; only a permission id this build does not know rejects.
//

#import "CapabilityProbe.h"

#import <React/RCTUtils.h>

#import <AVFoundation/AVFoundation.h>
#import <Contacts/Contacts.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <CoreLocation/CoreLocation.h>
#import <EventKit/EventKit.h>
#import <Network/Network.h>
#import <Photos/Photos.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>

#import <sys/utsname.h>
#import <TargetConditionals.h>

#pragma mark - Permission ids

/**
 * The permission ids this module understands.
 *
 * `wifi_scan` and `photo_write` are not rows of the 动态权限 card: the JS
 * wrapper already uses those two internal ids (`requestWifiScanPermission`
 * and `openAlbumWritePermissionSettings`), so they map onto the closest iOS
 * permission instead of failing with "未知的权限". On iOS the WiFi scan path
 * only ever looks at location, and the album-write settings page is the app's
 * own settings page in any case.
 */
typedef NS_ENUM(NSInteger, CPPermissionKind) {
  CPPermissionKindUnknown = 0,
  CPPermissionKindCamera,
  CPPermissionKindMicrophone,
  CPPermissionKindLocation,
  CPPermissionKindNotifications,
  CPPermissionKindCalendar,
  CPPermissionKindBluetooth,
  CPPermissionKindPhotoLibrary,
  CPPermissionKindContacts,
};

/// The one place the JS id is turned into a permission kind.
static CPPermissionKind CPPermissionKindFromIdentifier(NSString *identifier)
{
  if (![identifier isKindOfClass:[NSString class]]) {
    return CPPermissionKindUnknown;
  }
  if ([identifier isEqualToString:@"camera"]) {
    return CPPermissionKindCamera;
  }
  if ([identifier isEqualToString:@"microphone"]) {
    return CPPermissionKindMicrophone;
  }
  if ([identifier isEqualToString:@"location"] ||
      [identifier isEqualToString:@"wifi_scan"]) {
    return CPPermissionKindLocation;
  }
  if ([identifier isEqualToString:@"notifications"]) {
    return CPPermissionKindNotifications;
  }
  if ([identifier isEqualToString:@"calendar"]) {
    return CPPermissionKindCalendar;
  }
  if ([identifier isEqualToString:@"bluetooth"]) {
    return CPPermissionKindBluetooth;
  }
  if ([identifier isEqualToString:@"photo_library"] ||
      [identifier isEqualToString:@"photo_write"]) {
    return CPPermissionKindPhotoLibrary;
  }
  if ([identifier isEqualToString:@"contacts"]) {
    return CPPermissionKindContacts;
  }
  return CPPermissionKindUnknown;
}

static NSString *CPPermissionUnknownReason(NSString *identifier)
{
  return [NSString stringWithFormat:
      @"未知的权限：%@（iOS 只识别 camera / microphone / location / notifications / "
      @"calendar / bluetooth / photo_library / contacts）",
      identifier.length > 0 ? identifier : @"（空）"];
}

#pragma mark - Permission state mapping

/// `granted` / `denied` / `notDetermined`, the three states the JS side accepts.
static NSString *CPPermissionStateForAVAuthorizationStatus(AVAuthorizationStatus status)
{
  switch (status) {
    case AVAuthorizationStatusAuthorized:
      return @"granted";
    case AVAuthorizationStatusDenied:
    case AVAuthorizationStatusRestricted:
      return @"denied";
    case AVAuthorizationStatusNotDetermined:
    default:
      return @"notDetermined";
  }
}

static NSString *CPPermissionStateForRecordPermission(AVAudioSessionRecordPermission permission)
{
  switch (permission) {
    case AVAudioSessionRecordPermissionGranted:
      return @"granted";
    case AVAudioSessionRecordPermissionDenied:
      return @"denied";
    case AVAudioSessionRecordPermissionUndetermined:
    default:
      return @"notDetermined";
  }
}

static NSString *CPPermissionStateForLocationStatus(CLAuthorizationStatus status)
{
  switch (status) {
    case kCLAuthorizationStatusAuthorizedAlways:
    case kCLAuthorizationStatusAuthorizedWhenInUse:
      return @"granted";
    case kCLAuthorizationStatusDenied:
    case kCLAuthorizationStatusRestricted:
      return @"denied";
    case kCLAuthorizationStatusNotDetermined:
    default:
      return @"notDetermined";
  }
}

static NSString *CPPermissionStateForNotificationStatus(UNAuthorizationStatus status)
{
  if (status == UNAuthorizationStatusNotDetermined) {
    return @"notDetermined";
  }
  if (status == UNAuthorizationStatusDenied) {
    return @"denied";
  }
  if (status == UNAuthorizationStatusAuthorized) {
    return @"granted";
  }
  if (status == UNAuthorizationStatusProvisional) {
    // A provisional (quiet) notification grant is still a grant.
    return @"granted";
  }
  if (@available(iOS 14.0, *)) {
    if (status == UNAuthorizationStatusEphemeral) {
      return @"granted";
    }
  }
  return @"denied";
}

static NSString *CPPermissionStateForEventStatus(EKAuthorizationStatus status)
{
  if (status == EKAuthorizationStatusNotDetermined) {
    return @"notDetermined";
  }
  if (@available(iOS 17.0, *)) {
    if (status == EKAuthorizationStatusFullAccess) {
      return @"granted";
    }
    if (status == EKAuthorizationStatusWriteOnly) {
      // The row is about reading the calendar, so write-only is not a grant.
      return @"denied";
    }
  } else if (status == EKAuthorizationStatusAuthorized) {
    return @"granted";
  }
  return @"denied";
}

static NSString *CPPermissionStateForPhotoStatus(PHAuthorizationStatus status)
{
  if (status == PHAuthorizationStatusAuthorized) {
    return @"granted";
  }
  if (@available(iOS 14.0, *)) {
    if (status == PHAuthorizationStatusLimited) {
      // Limited means the user picked some photos; the album row is usable.
      return @"granted";
    }
  }
  if (status == PHAuthorizationStatusNotDetermined) {
    return @"notDetermined";
  }
  return @"denied";
}

static NSString *CPPermissionStateForContactsStatus(CNAuthorizationStatus status)
{
  switch (status) {
    case CNAuthorizationStatusAuthorized:
      return @"granted";
    case CNAuthorizationStatusDenied:
    case CNAuthorizationStatusRestricted:
      return @"denied";
    case CNAuthorizationStatusNotDetermined:
    default:
      return @"notDetermined";
  }
}

/**
 * The Bluetooth state, from CoreBluetooth.
 *
 * `+[CBManager authorization]` exists since iOS 13.1; on iOS 12 the manager's
 * own state is the only signal, and it stays `Unknown` until a CBCentralManager
 * exists, which the request path creates.
 */
static NSString *CPBluetoothPermissionState(CBCentralManager *central)
{
  if (@available(iOS 13.1, *)) {
    switch ([CBManager authorization]) {
      case CBManagerAuthorizationAllowedAlways:
        return @"granted";
      case CBManagerAuthorizationDenied:
      case CBManagerAuthorizationRestricted:
        return @"denied";
      case CBManagerAuthorizationNotDetermined:
      default:
        return @"notDetermined";
    }
  }
  if (central == nil) {
    return @"notDetermined";
  }
  switch (central.state) {
    case CBManagerStatePoweredOn:
    case CBManagerStatePoweredOff:
    case CBManagerStateResetting:
      return @"granted";
    case CBManagerStateUnauthorized:
    case CBManagerStateUnsupported:
      return @"denied";
    case CBManagerStateUnknown:
    default:
      return @"notDetermined";
  }
}

/**
 * The app-wide location permission.
 *
 * `+authorizationStatus` is deprecated on iOS 14 in favour of the instance
 * property, but it still reports the app-wide status and needs no manager.
 */
static CLAuthorizationStatus CPCurrentLocationAuthorizationStatus(void)
{
  if (@available(iOS 14.0, *)) {
    CLLocationManager *manager = [[CLLocationManager alloc] init];
    return manager.authorizationStatus;
  }
  return [CLLocationManager authorizationStatus];
}

#pragma mark - Device information

/// The hardware identifier (`iPhone15,3`), i.e. the iOS equivalent of a model.
static NSString *CPDeviceModelIdentifier(void)
{
#if TARGET_OS_SIMULATOR
  // `uname` answers arm64/x86_64 in the simulator, which is not a model name.
  NSString *simulatorName =
      [NSProcessInfo processInfo].environment[@"SIMULATOR_DEVICE_NAME"];
  if (simulatorName.length > 0) {
    return simulatorName;
  }
#endif
  struct utsname systemInfo;
  if (uname(&systemInfo) == 0) {
    NSString *machine = [NSString stringWithCString:systemInfo.machine
                                           encoding:NSUTF8StringEncoding];
    if (machine.length > 0) {
      return machine;
    }
  }
  return [UIDevice currentDevice].model;
}

#pragma mark - Network status

/// The first path update has to arrive within this many seconds.
static const NSTimeInterval CPNetworkStatusTimeout = 2.0;

/**
 * One `nw_path_monitor` read.
 *
 * Network.framework's Objective-C `NWPathMonitor` class is no longer declared
 * in the iOS 27 SDK headers (it is Swift-only there), so this uses the same
 * framework through its C API, which is available since iOS 12 and is compiled
 * identically on every SDK the app may be built with.
 */
@interface CPNetworkStatusProbe : NSObject
@property (nonatomic, copy, nullable) void (^completion)(nw_path_t _Nullable path);
@property (nonatomic, strong, nullable) nw_path_monitor_t monitor;
@property (nonatomic, assign) BOOL settled;
- (void)start;
- (void)finishWithPath:(nw_path_t _Nullable)path;
@end

@implementation CPNetworkStatusProbe

- (void)start
{
  nw_path_monitor_t monitor = nw_path_monitor_create();
  if (monitor == nil) {
    [self finishWithPath:nil];
    return;
  }
  self.monitor = monitor;
  dispatch_queue_t queue =
      dispatch_queue_create("com.kmp.playgroundrn.network-path", DISPATCH_QUEUE_SERIAL);
  nw_path_monitor_set_queue(monitor, queue);
  __weak CPNetworkStatusProbe *weakSelf = self;
  nw_path_monitor_set_update_handler(monitor, ^(nw_path_t path) {
    // The handler runs on the monitor's own queue; the read below is plain C,
    // but the promise is resolved on the main queue for consistency.
    dispatch_async(dispatch_get_main_queue(), ^{
      [weakSelf finishWithPath:path];
    });
  });
  nw_path_monitor_start(monitor);
}

- (void)finishWithPath:(nw_path_t)path
{
  CPNetworkStatusProbe *strongSelf = self;
  if (strongSelf.settled) {
    return;
  }
  strongSelf.settled = YES;
  void (^completion)(nw_path_t) = strongSelf.completion;
  strongSelf.completion = nil;
  if (strongSelf.monitor != nil) {
    nw_path_monitor_cancel(strongSelf.monitor);
    strongSelf.monitor = nil;
  }
  if (completion != nil) {
    completion(path);
  }
}

@end

/// Wi-Fi first, then cellular, then wired: the same precedence HarmonyOS uses.
static NSString *CPNetworkTransportForPath(nw_path_t path)
{
  if (nw_path_uses_interface_type(path, nw_interface_type_wifi)) {
    return @"wifi";
  }
  if (nw_path_uses_interface_type(path, nw_interface_type_cellular)) {
    return @"cellular";
  }
  if (nw_path_uses_interface_type(path, nw_interface_type_wired)) {
    return @"ethernet";
  }
  return @"unknown";
}

#pragma mark - Permission waiters

/// How long a location request may stay unanswered before the current state wins.
static const NSTimeInterval CPLocationPermissionTimeout = 15.0;
/// How long a Bluetooth request may stay unanswered before the current state wins.
static const NSTimeInterval CPBluetoothPermissionTimeout = 10.0;

/**
 * Resolves once for the iOS location dialog.
 *
 * `CLLocationManager.delegate` is weak, so the waiter keeps itself alive while
 * a request is in flight; both the pre-iOS-14 and the iOS-14+ delegate callbacks
 * are implemented, and `settled` makes sure the promise resolves only once.
 */
@interface CPLocationPermissionWaiter : NSObject <CLLocationManagerDelegate>
@property (nonatomic, strong, nullable) CLLocationManager *manager;
@property (nonatomic, copy, nullable) void (^completion)(NSString *state);
@property (nonatomic, assign) BOOL settled;
@property (nonatomic, strong, nullable) CPLocationPermissionWaiter *keepAlive;
- (void)request;
@end

@implementation CPLocationPermissionWaiter

- (void)request
{
  NSString *current =
      CPPermissionStateForLocationStatus(CPCurrentLocationAuthorizationStatus());
  if (![current isEqualToString:@"notDetermined"]) {
    // Already answered (granted or denied): asking again would not show a
    // dialog, so report the standing answer instead of pretending to ask.
    [self finishWithState:current];
    return;
  }
  self.keepAlive = self;
  self.manager = [[CLLocationManager alloc] init];
  self.manager.delegate = self;
  [self.manager requestWhenInUseAuthorization];
  __weak CPLocationPermissionWaiter *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,
                               (int64_t)(CPLocationPermissionTimeout * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    CPLocationPermissionWaiter *strongSelf = weakSelf;
    if (strongSelf == nil) {
      return;
    }
    [strongSelf
        finishWithState:CPPermissionStateForLocationStatus(
                            CPCurrentLocationAuthorizationStatus())];
  });
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager
{
  CLAuthorizationStatus status = kCLAuthorizationStatusNotDetermined;
  if (@available(iOS 14.0, *)) {
    status = manager.authorizationStatus;
  }
  NSString *state = CPPermissionStateForLocationStatus(status);
  if ([state isEqualToString:@"notDetermined"]) {
    // The dialog is still up; the next callback carries the answer.
    return;
  }
  [self finishWithState:state];
}

- (void)locationManager:(CLLocationManager *)manager
    didChangeAuthorizationStatus:(CLAuthorizationStatus)status
{
  if (status == kCLAuthorizationStatusNotDetermined) {
    return;
  }
  [self finishWithState:CPPermissionStateForLocationStatus(status)];
}

- (void)finishWithState:(NSString *)state
{
  CPLocationPermissionWaiter *strongSelf = self;
  if (strongSelf.settled) {
    return;
  }
  strongSelf.settled = YES;
  void (^completion)(NSString *) = strongSelf.completion;
  strongSelf.completion = nil;
  strongSelf.manager.delegate = nil;
  strongSelf.manager = nil;
  strongSelf.keepAlive = nil;
  if (completion != nil) {
    completion(state.length > 0 ? state : @"notDetermined");
  }
}

@end

/**
 * Resolves once for the iOS Bluetooth dialog.
 *
 * Creating the `CBCentralManager` is what makes iOS show its dialog; the
 * authorization is read back in the delegate callback, and a 10-second timeout
 * resolves the then-current state so the promise never stays pending.
 */
@interface CPBluetoothPermissionWaiter : NSObject <CBCentralManagerDelegate>
@property (nonatomic, strong, nullable) CBCentralManager *central;
@property (nonatomic, copy, nullable) void (^completion)(NSString *state);
@property (nonatomic, assign) BOOL settled;
@property (nonatomic, strong, nullable) CPBluetoothPermissionWaiter *keepAlive;
- (void)request;
@end

@implementation CPBluetoothPermissionWaiter

- (void)request
{
  NSString *current = CPBluetoothPermissionState(nil);
  if (![current isEqualToString:@"notDetermined"]) {
    [self finishWithState:current];
    return;
  }
  self.keepAlive = self;
  self.central = [[CBCentralManager alloc] initWithDelegate:self
                                                     queue:dispatch_get_main_queue()];
  __weak CPBluetoothPermissionWaiter *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,
                               (int64_t)(CPBluetoothPermissionTimeout * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    CPBluetoothPermissionWaiter *strongSelf = weakSelf;
    if (strongSelf == nil) {
      return;
    }
    [strongSelf finishWithState:CPBluetoothPermissionState(strongSelf.central)];
  });
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central
{
  NSString *state = CPBluetoothPermissionState(central);
  if ([state isEqualToString:@"notDetermined"]) {
    // Still waiting for the user to answer the system dialog.
    return;
  }
  [self finishWithState:state];
}

- (void)finishWithState:(NSString *)state
{
  CPBluetoothPermissionWaiter *strongSelf = self;
  if (strongSelf.settled) {
    return;
  }
  strongSelf.settled = YES;
  void (^completion)(NSString *) = strongSelf.completion;
  strongSelf.completion = nil;
  strongSelf.central.delegate = nil;
  strongSelf.central = nil;
  strongSelf.keepAlive = nil;
  if (completion != nil) {
    completion(state.length > 0 ? state : @"notDetermined");
  }
}

@end

#pragma mark - CapabilityProbe

@implementation CapabilityProbe

RCT_EXPORT_MODULE(CapabilityProbe)

+ (BOOL)requiresMainQueueSetup
{
  // Nothing is created in `init`; every method hops to the main queue itself.
  return NO;
}

#pragma mark Device information

RCT_EXPORT_METHOD(readDeviceInfo:(RCTPromiseResolveBlock)resolve
                         reject:(RCTPromiseRejectBlock)reject)
{
  (void)reject;
  // `UIDevice` wants the main thread, and the bundle lookup is cheap enough to
  // do there as well.
  dispatch_async(dispatch_get_main_queue(), ^{
    NSBundle *bundle = [NSBundle mainBundle];
    NSString *appName = [bundle objectForInfoDictionaryKey:@"CFBundleDisplayName"];
    if (![appName isKindOfClass:[NSString class]] || appName.length == 0) {
      appName = [bundle objectForInfoDictionaryKey:@"CFBundleName"];
    }
    if (![appName isKindOfClass:[NSString class]] || appName.length == 0) {
      appName = bundle.bundleIdentifier.length > 0 ? bundle.bundleIdentifier
                                                   : @"KmpPlaygroundRn";
    }
    NSString *appVersion = [bundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
    if (![appVersion isKindOfClass:[NSString class]] || appVersion.length == 0) {
      appVersion = @"0";
    }
    NSString *systemVersion = [UIDevice currentDevice].systemVersion;
    resolve(@{
      @"model" : CPDeviceModelIdentifier(),
      @"systemName" : @"iOS",
      @"systemVersion" : systemVersion.length > 0 ? systemVersion : @"未知",
      @"appName" : appName,
      @"appVersion" : appVersion,
    });
  });
}

#pragma mark Network status

RCT_EXPORT_METHOD(readNetworkStatus:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject)
{
  CPNetworkStatusProbe *probe = [[CPNetworkStatusProbe alloc] init];
  probe.completion = ^(nw_path_t path) {
    if (path == nil) {
      // No path within the timeout. Saying "none" here would claim the device
      // is offline, which is not what happened.
      reject(@"E_NETWORK_STATUS_TIMEOUT",
             @"读取网络状态超时：系统没有在 2 秒内返回网络路径", nil);
      return;
    }
    BOOL connected = nw_path_get_status(path) == nw_path_status_satisfied;
    NSString *type = connected ? CPNetworkTransportForPath(path) : @"none";
    resolve(@{@"connected" : @(connected), @"type" : type});
  };
  [probe start];
  // The block keeps the probe (and its monitor) alive until the deadline; a
  // path that arrived earlier has already cancelled the monitor.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,
                               (int64_t)(CPNetworkStatusTimeout * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    [probe finishWithPath:nil];
  });
}

#pragma mark Storage directories

RCT_EXPORT_METHOD(readDirectories:(BOOL)requestPermissions
                          resolve:(RCTPromiseResolveBlock)resolve
                           reject:(RCTPromiseRejectBlock)reject)
{
  // None of these paths is behind a runtime permission on iOS, so `requestPermissions`
  // never shows a dialog; the flag is only part of the shared JS signature.
  (void)requestPermissions;
  (void)reject;
  NSFileManager *fileManager = [NSFileManager defaultManager];
  NSString *(^directory)(NSSearchPathDirectory) = ^NSString *(NSSearchPathDirectory kind) {
    NSString *path =
        NSSearchPathForDirectoriesInDomains(kind, NSUserDomainMask, YES).firstObject;
    return path.length > 0 ? path : @"";
  };
  NSString *cache = directory(NSCachesDirectory);
  NSString *documents = directory(NSDocumentDirectory);
  NSString *applicationSupport = directory(NSApplicationSupportDirectory);
  NSString *temporary = NSTemporaryDirectory();
  if (![temporary isKindOfClass:[NSString class]]) {
    temporary = @"";
  }
  NSDictionary *(^row)(NSString *, NSString *, NSString *) =
      ^NSDictionary *(NSString *kind, NSString *path, NSString *note) {
    BOOL exists = path.length > 0 ? [fileManager fileExistsAtPath:path] : NO;
    return @{
      @"kind" : kind,
      @"path" : path ?: @"",
      @"exists" : @(exists),
      @"note" : note ?: @"",
    };
  };
  // The seven rows of the shared card, in its order. iOS has one Documents
  // directory, so Files and Documents honestly name the same path.
  resolve(@[
    row(@"Cache", cache, @""),
    row(@"Files", documents, @""),
    row(@"Database", applicationSupport,
        @"iOS 没有单独的数据库目录，数据库文件通常放在 Application Support 下"),
    row(@"Temp", temporary, @""),
    row(@"Downloads", @"",
        @"iOS 没有公共下载目录；文件应放进 App 自己的 Documents 或通过系统文件 App 访问"),
    row(@"Documents", documents,
        @"iOS 的 Documents 是 App 私有目录，可在 Info.plist 打开 UIFileSharingEnabled 后由文件 App 访问；iOS 只有一个 Documents 目录，与 Files 是同一路径"),
    row(@"PhotoAlbum", @"",
        @"iOS 相册通过 PHPhotoLibrary 的本地标识访问，没有可直接使用的目录路径"),
  ]);
}

#pragma mark Haptics

RCT_EXPORT_METHOD(vibrateHaptic:(NSString *)strength
                        resolve:(RCTPromiseResolveBlock)resolve
                         reject:(RCTPromiseRejectBlock)reject)
{
  NSString *requested = [strength isKindOfClass:[NSString class]] ? strength : @"";
  UIImpactFeedbackStyle style;
  if ([requested isEqualToString:@"light"]) {
    style = UIImpactFeedbackStyleLight;
  } else if ([requested isEqualToString:@"medium"]) {
    style = UIImpactFeedbackStyleMedium;
  } else if ([requested isEqualToString:@"heavy"]) {
    style = UIImpactFeedbackStyleHeavy;
  } else {
    reject(@"E_UNKNOWN_HAPTIC_STRENGTH",
           [NSString stringWithFormat:@"未知的震动档位：%@", requested], nil);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    UIImpactFeedbackGenerator *generator =
        [[UIImpactFeedbackGenerator alloc] initWithStyle:style];
    [generator prepare];
    [generator impactOccurred];
    // A simulator has no taptic engine, but the API call itself is valid; the
    // row can still report that the tap was fired.
    resolve(@{@"fired" : @YES, @"note" : @""});
  });
}

#pragma mark System share

RCT_EXPORT_METHOD(shareText:(NSString *)text
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject)
{
  NSString *value = [text isKindOfClass:[NSString class]] ? text : @"";
  if ([value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]]
          .length == 0) {
    reject(@"E_EMPTY_SHARE_TEXT", @"没有可分享的文本", nil);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *presenter = RCTPresentedViewController();
    if (presenter == nil) {
      reject(@"E_NO_PRESENTER", @"找不到可以展示分享面板的界面", nil);
      return;
    }
    UIActivityViewController *controller =
        [[UIActivityViewController alloc] initWithActivityItems:@[ value ]
                                          applicationActivities:nil];
    // On iPad the panel is a popover and needs an anchor; without it UIKit
    // throws when the panel is presented.
    UIPopoverPresentationController *popover = controller.popoverPresentationController;
    if (popover != nil) {
      popover.sourceView = presenter.view;
      popover.sourceRect = CGRectMake(CGRectGetMidX(presenter.view.bounds),
                                      CGRectGetMidY(presenter.view.bounds), 1.0, 1.0);
    }
    // Resolve on presentation, not on the user's choice: iOS does not report
    // which target was picked, and the row must not claim "shared".
    [presenter presentViewController:controller
                            animated:YES
                          completion:^{
                            resolve(nil);
                          }];
  });
}

#pragma mark Permissions

RCT_EXPORT_METHOD(readPermissionState:(NSString *)permission
                              resolve:(RCTPromiseResolveBlock)resolve
                               reject:(RCTPromiseRejectBlock)reject)
{
  CPPermissionKind kind = CPPermissionKindFromIdentifier(permission);
  if (kind == CPPermissionKindUnknown) {
    reject(@"E_UNKNOWN_PERMISSION", CPPermissionUnknownReason(permission), nil);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    switch (kind) {
      case CPPermissionKindCamera:
        resolve(CPPermissionStateForAVAuthorizationStatus(
            [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo]));
        return;
      case CPPermissionKindMicrophone:
        resolve(CPPermissionStateForRecordPermission(
            [[AVAudioSession sharedInstance] recordPermission]));
        return;
      case CPPermissionKindLocation:
        resolve(CPPermissionStateForLocationStatus(CPCurrentLocationAuthorizationStatus()));
        return;
      case CPPermissionKindNotifications: {
        [[UNUserNotificationCenter currentNotificationCenter]
            getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
              resolve(CPPermissionStateForNotificationStatus(settings.authorizationStatus));
            }];
        return;
      }
      case CPPermissionKindCalendar:
        resolve(CPPermissionStateForEventStatus(
            [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent]));
        return;
      case CPPermissionKindBluetooth:
        resolve(CPBluetoothPermissionState(nil));
        return;
      case CPPermissionKindPhotoLibrary: {
        PHAuthorizationStatus status;
        if (@available(iOS 14.0, *)) {
          status = [PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
        } else {
          status = [PHPhotoLibrary authorizationStatus];
        }
        resolve(CPPermissionStateForPhotoStatus(status));
        return;
      }
      case CPPermissionKindContacts:
        resolve(CPPermissionStateForContactsStatus(
            [CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts]));
        return;
      case CPPermissionKindUnknown:
        // Rejected before the hop; kept so the switch is exhaustive.
        break;
    }
    reject(@"E_UNKNOWN_PERMISSION", CPPermissionUnknownReason(permission), nil);
  });
}

RCT_EXPORT_METHOD(requestPermission:(NSString *)permission
                            resolve:(RCTPromiseResolveBlock)resolve
                             reject:(RCTPromiseRejectBlock)reject)
{
  CPPermissionKind kind = CPPermissionKindFromIdentifier(permission);
  if (kind == CPPermissionKindUnknown) {
    reject(@"E_UNKNOWN_PERMISSION", CPPermissionUnknownReason(permission), nil);
    return;
  }
  switch (kind) {
    case CPPermissionKindCamera: {
      // The completion handler runs on an arbitrary queue; resolving from
      // there is safe.
      [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
                               completionHandler:^(BOOL granted) {
                                 resolve(granted ? @"granted" : @"denied");
                               }];
      return;
    }
    case CPPermissionKindMicrophone: {
      [[AVAudioSession sharedInstance]
          requestRecordPermission:^(BOOL granted) {
            resolve(granted ? @"granted" : @"denied");
          }];
      return;
    }
    case CPPermissionKindLocation: {
      // CoreLocation wants a run loop, so the manager is created on the main
      // queue; the waiter keeps itself alive until the delegate answers.
      dispatch_async(dispatch_get_main_queue(), ^{
        CPLocationPermissionWaiter *waiter = [[CPLocationPermissionWaiter alloc] init];
        waiter.completion = ^(NSString *state) {
          resolve(state);
        };
        [waiter request];
      });
      return;
    }
    case CPPermissionKindNotifications: {
      UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
      [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert |
                                             UNAuthorizationOptionBadge |
                                             UNAuthorizationOptionSound)
                            completionHandler:^(BOOL granted, NSError *error) {
                              // `granted` is only Alert/Badge/Sound; the
                              // settings read below is the authoritative state
                              // (it also covers provisional/ephemeral).
                              (void)granted;
                              (void)error;
                              [center
                                  getNotificationSettingsWithCompletionHandler:
                                      ^(UNNotificationSettings *settings) {
                                        resolve(CPPermissionStateForNotificationStatus(
                                            settings.authorizationStatus));
                                      }];
                            }];
      return;
    }
    case CPPermissionKindCalendar: {
      EKEventStore *store = [[EKEventStore alloc] init];
      if (@available(iOS 17.0, *)) {
        [store requestFullAccessToEventsWithCompletion:^(BOOL granted, NSError *error) {
          // Referencing the store keeps it alive until EventKit answers.
          (void)store;
          (void)error;
          resolve(granted ? @"granted" : @"denied");
        }];
      } else {
        [store requestAccessToEntityType:EKEntityTypeEvent
                              completion:^(BOOL granted, NSError *error) {
                                (void)store;
                                (void)error;
                                resolve(granted ? @"granted" : @"denied");
                              }];
      }
      return;
    }
    case CPPermissionKindBluetooth: {
      // Creating the CBCentralManager is what shows the dialog; it is created
      // on the main queue, where its delegate callbacks are delivered.
      dispatch_async(dispatch_get_main_queue(), ^{
        CPBluetoothPermissionWaiter *waiter = [[CPBluetoothPermissionWaiter alloc] init];
        waiter.completion = ^(NSString *state) {
          resolve(state);
        };
        [waiter request];
      });
      return;
    }
    case CPPermissionKindPhotoLibrary: {
      if (@available(iOS 14.0, *)) {
        [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite
                                                   handler:^(PHAuthorizationStatus status) {
                                                     resolve(CPPermissionStateForPhotoStatus(
                                                         status));
                                                   }];
      } else {
        [PHPhotoLibrary requestAuthorization:^(PHAuthorizationStatus status) {
          resolve(CPPermissionStateForPhotoStatus(status));
        }];
      }
      return;
    }
    case CPPermissionKindContacts: {
      CNContactStore *store = [[CNContactStore alloc] init];
      [store requestAccessForEntityType:CNEntityTypeContacts
                     completionHandler:^(BOOL granted, NSError *error) {
                       (void)store;
                       (void)error;
                       resolve(granted ? @"granted" : @"denied");
                     }];
      return;
    }
    case CPPermissionKindUnknown:
      break;
  }
  reject(@"E_UNKNOWN_PERMISSION", CPPermissionUnknownReason(permission), nil);
}

RCT_EXPORT_METHOD(openPermissionSettings:(NSString *)permission
                                 resolve:(RCTPromiseResolveBlock)resolve
                                  reject:(RCTPromiseRejectBlock)reject)
{
  // Every permission of this app lives on one page of the Settings app. An
  // unknown id is acceptable here: it still opens that page.
  CPPermissionKind kind = CPPermissionKindFromIdentifier(permission);
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *url = nil;
    if (@available(iOS 16.0, *)) {
      if (kind == CPPermissionKindNotifications) {
        url = [NSURL URLWithString:UIApplicationOpenNotificationSettingsURLString];
      }
    }
    if (url == nil) {
      url = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
    }
    UIApplication *application = [UIApplication sharedApplication];
    if (url == nil) {
      reject(@"E_NO_SETTINGS_URL", @"系统没有可打开的应用设置页面", nil);
      return;
    }
    [application openURL:url
                  options:@{}
        completionHandler:^(BOOL success) {
          if (success) {
            resolve(nil);
          } else {
            reject(@"E_OPEN_SETTINGS", @"打开系统设置失败", nil);
          }
        }];
  });
}

@end

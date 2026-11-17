//
//  WifiNetwork.mm
//  KmpPlaygroundRn
//
//  iOS implementation of the HarmonyOS `WifiNetwork` module.
//
//  The three methods exist so `src/native/wifiNetwork.ts` keeps the same code
//  on every platform, but iOS genuinely cannot do what the HarmonyOS build
//  does:
//
//  - listing nearby APs needs the Access WiFi Information / Hotspot
//    configuration entitlements (a paid developer account plus Apple review),
//    and even with them `NEHotspotHelper` only filters a system list;
//  - the current SSID needs Access WiFi Information;
//  - joining a network needs the Hotspot Configuration entitlement and shows a
//    system permission dialog, which this page must not fake.
//
//  Every answer is therefore the honest "failed / unknown, and here is why"
//  shape the JS wrapper already understands. No access point is ever invented.
//

#import "WifiNetwork.h"

#import <CoreLocation/CoreLocation.h>

/// Why the AP list is empty on iOS; the page prints this verbatim.
static NSString *const CPWifiScanUnavailableReason =
    @"iOS 不向普通应用提供附近 Wi-Fi 扫描：需要 Access WiFi Information / Hotspot "
    @"配置权限（付费开发者账号且 Apple 审核），本页在 iOS 上无法列出附近 AP";

/// Why the current SSID cannot be read on iOS.
static NSString *const CPWifiSsidUnavailableReason =
    @"iOS 不向普通应用提供当前 SSID：需要 Access WiFi Information 配置权限";

/// Why `connect` cannot join a network on iOS.
static NSString *const CPWifiConnectUnavailableReason =
    @"iOS 不允许普通应用以编程方式连接指定 Wi-Fi（需要 NEHotspotConfiguration 的 "
    @"Hotspot Configuration 权限，且系统会弹授权）";

/// The location switch plus this app's location grant; the scan row shows it.
static BOOL CPWifiLocationEnabled(void)
{
  if (![CLLocationManager locationServicesEnabled]) {
    return NO;
  }
  CLAuthorizationStatus status;
  if (@available(iOS 14.0, *)) {
    CLLocationManager *manager = [[CLLocationManager alloc] init];
    status = manager.authorizationStatus;
  } else {
    status = [CLLocationManager authorizationStatus];
  }
  return status == kCLAuthorizationStatusAuthorizedWhenInUse ||
         status == kCLAuthorizationStatusAuthorizedAlways;
}

@implementation WifiNetwork

RCT_EXPORT_MODULE(WifiNetwork)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

/**
 * Always an empty list. `wifiActive` is reported as YES because iOS gives an
 * app without the WiFi-info entitlement no way to read the Wi-Fi switch; the
 * reason above is what explains the empty list, not a fake "Wi-Fi is off".
 */
RCT_EXPORT_METHOD(scan:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject)
{
  (void)reject;
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(@{
      @"accessPoints" : @[],
      @"wifiActive" : @YES,
      @"locationEnabled" : @(CPWifiLocationEnabled()),
      @"reason" : CPWifiScanUnavailableReason,
    });
  });
}

/// `known: NO` is a real refusal, not "not connected to anything".
RCT_EXPORT_METHOD(currentSsid:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject)
{
  (void)reject;
  resolve(@{
    @"known" : @NO,
    @"ssid" : @"",
    @"reason" : CPWifiSsidUnavailableReason,
  });
}

/**
 * Always `failed`: the app cannot ask iOS to join `ssid`, so neither
 * `connected` nor `userDeclined` would describe something that happened.
 */
RCT_EXPORT_METHOD(connect:(NSString *)ssid
                  password:(NSString *)password
              securityType:(NSNumber *)securityType
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject)
{
  (void)ssid;
  (void)password;
  (void)securityType;
  (void)reject;
  resolve(@{
    @"outcome" : @"failed",
    @"reason" : CPWifiConnectUnavailableReason,
  });
}

@end

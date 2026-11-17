//
//  ImageSave.mm
//  KmpPlaygroundRn
//
//  iOS implementation of the HarmonyOS `ImageSave` module: decode the base64
//  PNG, ask for add-only album access, then create one photo asset.
//
//  The payload is the one `src/native/imageSave.ts` validates:
//
//    saved: YES -> {saved, uri, title, permissionDenied: NO, reason: ""}
//    user said no -> {saved: NO, uri: "", title: "", permissionDenied: YES, reason}
//    anything else -> {saved: NO, uri: "", title: "", permissionDenied: NO, reason}
//
//  Rejections are reserved for a broken call (there are none here), so the page
//  can distinguish the two expected failures instead of receiving one opaque
//  Error.
//

#import "ImageSave.h"

#import <Photos/Photos.h>
#import <UIKit/UIKit.h>

#import <string.h>

#pragma mark - Payload helpers

static NSDictionary *CPImageSaveFailure(NSString *reason, BOOL permissionDenied)
{
  return @{
    @"saved" : @NO,
    @"uri" : @"",
    @"title" : @"",
    @"permissionDenied" : @(permissionDenied),
    @"reason" : reason.length > 0 ? reason : @"保存到相册失败：平台没有给出原因",
  };
}

/// The eight bytes every PNG file starts with.
static BOOL CPImageSaveDataHasPngSignature(NSData *data)
{
  static const unsigned char signature[] = {0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
  if (data.length < sizeof(signature)) {
    return NO;
  }
  return memcmp(data.bytes, signature, sizeof(signature)) == 0;
}

/**
 * The asset title: no path separators, no `..`, trimmed, and `qr-code` when
 * nothing usable is left. The page already sends `KMP-RN-QR-<stamp>`; this
 * keeps a future caller safe without inventing a different name.
 */
static NSString *CPImageSaveSafeTitle(NSString *title)
{
  NSString *raw = [title isKindOfClass:[NSString class]] ? title : @"";
  NSString *cleaned = [raw stringByReplacingOccurrencesOfString:@".." withString:@"-"];
  cleaned = [cleaned stringByReplacingOccurrencesOfString:@"/" withString:@"-"];
  cleaned = [cleaned stringByReplacingOccurrencesOfString:@"\\" withString:@"-"];
  cleaned = [cleaned stringByTrimmingCharactersInSet:
                          [NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (cleaned.length == 0) {
    return @"qr-code";
  }
  if (cleaned.length > 80) {
    cleaned = [cleaned substringToIndex:80];
  }
  return cleaned;
}

/**
 * Asks for add-only album access and reports the outcome.
 *
 * `granted` is true only for a granted/limited status; `denied` marks the
 * refusal the page answers with 去设置. iOS 14+ uses the add-only access level
 * (the narrow permission the save actually needs); the fallback asks for the
 * whole library on iOS 12/13, which is the only API those versions have.
 */
static void CPImageSaveRequestAddOnlyAuthorization(
    void (^completion)(BOOL granted, BOOL denied, NSString *reason))
{
  PHAuthorizationStatus status;
  if (@available(iOS 14.0, *)) {
    status = [PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelAddOnly];
  } else {
    status = [PHPhotoLibrary authorizationStatus];
  }
  if (status == PHAuthorizationStatusAuthorized) {
    completion(YES, NO, @"");
    return;
  }
  if (status == PHAuthorizationStatusDenied || status == PHAuthorizationStatusRestricted) {
    completion(NO, YES, @"相册写入权限被拒绝（NSPhotoLibraryAddUsageDescription）");
    return;
  }

  void (^handler)(PHAuthorizationStatus) = ^(PHAuthorizationStatus result) {
    if (result == PHAuthorizationStatusAuthorized) {
      completion(YES, NO, @"");
      return;
    }
    if (@available(iOS 14.0, *)) {
      if (result == PHAuthorizationStatusLimited) {
        // Not returned for add-only access, but if it ever is, the app may add.
        completion(YES, NO, @"");
        return;
      }
    }
    if (result == PHAuthorizationStatusDenied ||
        result == PHAuthorizationStatusRestricted) {
      completion(NO, YES, @"相册写入权限被拒绝（NSPhotoLibraryAddUsageDescription）");
      return;
    }
    completion(NO, NO,
               [NSString stringWithFormat:@"相册写入权限状态未知（%ld）", (long)result]);
  };

  if (@available(iOS 14.0, *)) {
    [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelAddOnly handler:handler];
  } else {
    [PHPhotoLibrary requestAuthorization:handler];
  }
}

#pragma mark - ImageSave

@implementation ImageSave

RCT_EXPORT_MODULE(ImageSave)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

/**
 * `base64` is a complete PNG without a data-URL prefix; `title` names the
 * asset. Resolves the payload described at the top of this file.
 */
RCT_EXPORT_METHOD(saveImage:(NSString *)base64
                      title:(NSString *)title
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject)
{
  // Every failure is reported as a value; a rejection would flatten "the user
  // said no" and "the write failed" into one opaque Error.
  (void)reject;
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *encoded = [base64 isKindOfClass:[NSString class]] ? base64 : @"";
    if (encoded.length == 0) {
      resolve(CPImageSaveFailure(@"没有可保存的 PNG 内容", NO));
      return;
    }
    NSData *data = [[NSData alloc] initWithBase64EncodedString:encoded
                                                       options:NSDataBase64DecodingIgnoreUnknownCharacters];
    if (data.length == 0) {
      resolve(CPImageSaveFailure(@"PNG base64 解码失败", NO));
      return;
    }
    if (!CPImageSaveDataHasPngSignature(data)) {
      resolve(CPImageSaveFailure(@"传入的内容不是 PNG", NO));
      return;
    }
    // UIKit image creation stays on the main queue.
    UIImage *image = [UIImage imageWithData:data];
    if (image == nil) {
      resolve(CPImageSaveFailure(@"PNG 数据无法解码成图片", NO));
      return;
    }
    NSString *safeTitle = CPImageSaveSafeTitle(title);

    CPImageSaveRequestAddOnlyAuthorization(
        ^(BOOL granted, BOOL denied, NSString *reason) {
          if (!granted) {
            resolve(CPImageSaveFailure(reason, denied));
            return;
          }
          // The placeholder is the only handle on the new asset inside the
          // change block; its localIdentifier is the album URI afterwards.
          __block NSString *createdIdentifier = nil;
          [[PHPhotoLibrary sharedPhotoLibrary]
              performChanges:^{
                PHAssetChangeRequest *request =
                    [PHAssetChangeRequest creationRequestForAssetFromImage:image];
                createdIdentifier = request.placeholderForCreatedAsset.localIdentifier;
              }
              completionHandler:^(BOOL success, NSError *error) {
                if (!success) {
                  NSString *description = error.localizedDescription;
                  resolve(CPImageSaveFailure(
                      [NSString stringWithFormat:@"写入相册失败：%@",
                                                 description.length > 0 ? description
                                                                        : @"系统没有给出原因"],
                      NO));
                  return;
                }
                if (createdIdentifier.length == 0) {
                  resolve(CPImageSaveFailure(@"写入相册失败：系统没有返回相册资源标识", NO));
                  return;
                }
                resolve(@{
                  @"saved" : @YES,
                  @"uri" : [@"ph://" stringByAppendingString:createdIdentifier],
                  @"title" : safeTitle,
                  @"permissionDenied" : @NO,
                  @"reason" : @"",
                });
              }];
        });
  });
}

@end

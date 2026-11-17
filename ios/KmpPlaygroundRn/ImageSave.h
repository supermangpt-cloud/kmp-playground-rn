//
//  ImageSave.h
//  KmpPlaygroundRn
//
//  The iOS side of the `ImageSave` module: writing one generated PNG into the
//  system photo library. Same module name and payload as the HarmonyOS build,
//  so `src/native/imageSave.ts` keeps working unchanged.
//

#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Writes the PNG passed as base64 into the album of this device.
 *
 * The answer is always a dictionary — `saved` says whether the asset was
 * written — because the page has to tell "the user refused the album
 * permission, offer 去设置" from "the platform failed, show the reason".
 */
@interface ImageSave : NSObject <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END

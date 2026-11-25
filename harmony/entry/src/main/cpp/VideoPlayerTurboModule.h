#pragma once

#include <string>

#include "RNOH/ArkTSTurboModule.h"

namespace rnoh {

/**
 * C++ face of the app's `VideoPlayer` ArkTS module.
 *
 * The method map is required: under the CAPI architecture React Native's
 * `TurboModule` host object only exposes the names listed here. Without it the
 * module object exists and is "created" (which is what the log shows), but every
 * call silently goes nowhere — the video page then polls a clock that never
 * moves.
 *
 * Everything is synchronous so the page can poll `getState` without crossing the
 * boundary asynchronously on every frame.
 */
class VideoPlayerTurboModule : public ArkTSTurboModule {
 public:
  VideoPlayerTurboModule(
      const ArkTSTurboModule::Context ctx,
      const std::string name)
      : ArkTSTurboModule(ctx, name) {
    methodMap_ = {
        ARK_METHOD_METADATA(open, 2),
        ARK_METHOD_METADATA(getState, 1),
        ARK_METHOD_METADATA(setPaused, 2),
        ARK_METHOD_METADATA(seekTo, 2),
        ARK_METHOD_METADATA(isPipSupported, 0),
        ARK_METHOD_METADATA(isInPip, 0),
        ARK_METHOD_METADATA(enterPip, 0),
        ARK_METHOD_METADATA(setFullscreen, 1),
        ARK_METHOD_METADATA(close, 1),
    };
  }
};

} // namespace rnoh

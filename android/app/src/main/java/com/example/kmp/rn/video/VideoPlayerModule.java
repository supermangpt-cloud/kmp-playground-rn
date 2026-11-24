package com.example.kmp.rn.video;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;

/**
 * Reads playback state for the 视频播放 page.
 *
 * The page polls `getState` instead of subscribing to component events: on
 * HarmonyOS an ArkTS-backed custom component cannot deliver events to JS yet, so
 * a module that behaves identically everywhere keeps the page the same on every
 * platform.
 *
 * Every access hops to the main thread — ExoPlayer throws
 * 「Player is accessed on the wrong thread」 from the native-modules queue.
 */
public class VideoPlayerModule extends ReactContextBaseJavaModule {

  public static final String NAME = "VideoPlayer";

  public VideoPlayerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  /** Snapshot of one player: position, duration, flags and the last error. */
  @ReactMethod
  public void getState(String playerId, Promise promise) {
    UiThreadUtil.runOnUiThread(
        () -> {
          VideoView view = VideoRegistry.find(playerId);
          WritableMap state = Arguments.createMap();
          state.putBoolean("found", view != null);
          if (view == null) {
            // Distinguishes "no such player yet" from "the module is missing".
            promise.resolve(state);
            return;
          }
          state.putDouble("position", view.getPositionMs());
          state.putDouble("duration", view.getDurationMs());
          state.putBoolean("playing", view.isPlaying());
          state.putBoolean("ended", view.hasEnded());
          state.putBoolean("buffering", view.isBuffering());
          state.putString("error", view.getLastError());
          promise.resolve(state);
        });
  }

  @ReactMethod
  public void seekTo(String playerId, double positionMs) {
    UiThreadUtil.runOnUiThread(
        () -> {
          VideoView view = VideoRegistry.find(playerId);
          if (view != null) {
            view.seekTo((long) positionMs);
          }
        });
  }
}

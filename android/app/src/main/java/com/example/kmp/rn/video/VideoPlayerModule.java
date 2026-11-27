package com.example.kmp.rn.video;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.util.Rational;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

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

  /** What to restore when 全屏 is left; the Activity declares no orientation. */
  private int orientationBeforeFullscreen = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;

  public VideoPlayerModule(ReactApplicationContext reactContext) {
    super(reactContext);
    PipModeBus.attach(reactContext);
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

  /** Whether this device supports the system picture-in-picture window. */
  @ReactMethod
  public void isPipSupported(com.facebook.react.bridge.Promise promise) {
    Activity activity = getCurrentActivity();
    boolean supported =
        activity != null
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && activity
                .getPackageManager()
                .hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    promise.resolve(supported);
  }

  /** True while the system shows this app in its picture-in-picture window. */
  @ReactMethod
  public void isInPip(com.facebook.react.bridge.Promise promise) {
    Activity activity = getCurrentActivity();
    promise.resolve(activity != null && activity.isInPictureInPictureMode());
  }

  @ReactMethod
  public void enterPip() {
    UiThreadUtil.runOnUiThread(
        () -> {
          Activity activity = getCurrentActivity();
          if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
          }
          activity.enterPictureInPictureMode(
              new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build());
        });
  }

  /**
   * Turns the window landscape and hides the system bars, or puts both back.
   *
   * MainActivity declares no orientation, so leaving fullscreen restores the one
   * the page had before entering — "unspecified" would hand the choice to the
   * sensor and leave a phone lying flat in landscape.
   */
  @ReactMethod
  public void setFullscreen(boolean fullscreen) {
    UiThreadUtil.runOnUiThread(
        () -> {
          Activity activity = getCurrentActivity();
          if (activity == null) {
            return;
          }
          if (fullscreen) {
            boolean landscape =
                activity.getResources().getConfiguration().orientation
                    == Configuration.ORIENTATION_LANDSCAPE;
            orientationBeforeFullscreen =
                landscape
                    ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                    : android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
            activity.setRequestedOrientation(
                android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
          } else {
            activity.setRequestedOrientation(orientationBeforeFullscreen);
          }
          android.view.Window window = activity.getWindow();
          if (window == null) {
            return;
          }
          WindowInsetsControllerCompat controller =
              new WindowInsetsControllerCompat(window, window.getDecorView());
          if (fullscreen) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
          } else {
            controller.show(WindowInsetsCompat.Type.systemBars());
          }
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

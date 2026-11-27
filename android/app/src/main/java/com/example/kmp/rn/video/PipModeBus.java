package com.example.kmp.rn.video;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

/**
 * Carries the Activity's picture-in-picture transitions to JS.
 *
 * Polling `isInPictureInPictureMode()` from JS does not work: entering PiP pauses
 * the Activity, and React Native's timers stop with it — the page then never
 * learns it is in the small window, so it keeps drawing its header and chrome
 * inside it instead of only the video.
 */
public final class PipModeBus {

  public static final String EVENT_NAME = "videoPipChanged";

  private static ReactApplicationContext context;
  private static Boolean lastValue;

  private PipModeBus() {}

  public static void attach(@Nullable ReactApplicationContext reactContext) {
    context = reactContext;
    lastValue = null;
  }

  /** Called from `MainActivity.onPictureInPictureModeChanged`. */
  public static void notifyChanged(boolean inPip) {
    ReactApplicationContext reactContext = context;
    if (reactContext == null) {
      return;
    }
    if (lastValue != null && lastValue == inPip) {
      return;
    }
    lastValue = inPip;
    WritableMap payload = Arguments.createMap();
    payload.putBoolean("inPip", inPip);
    reactContext.emitDeviceEvent(EVENT_NAME, payload);
  }
}

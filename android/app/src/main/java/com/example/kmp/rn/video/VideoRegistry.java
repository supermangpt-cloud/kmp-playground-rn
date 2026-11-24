package com.example.kmp.rn.video;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tag → live {@link VideoView} lookup.
 *
 * The page reads playback state by polling the `VideoPlayer` module instead of
 * listening to component events, so the module needs a way to find the view that
 * belongs to a React tag.
 */
public final class VideoRegistry {

  private static final Map<String, VideoView> VIEWS = new ConcurrentHashMap<>();

  private VideoRegistry() {}

  public static void add(@NonNull String playerId, @NonNull VideoView view) {
    VIEWS.put(playerId, view);
  }

  /** Only removes the entry when it still points at this view. */
  public static void remove(@NonNull String playerId, @NonNull VideoView view) {
    VIEWS.remove(playerId, view);
  }

  @Nullable
  public static VideoView find(@NonNull String playerId) {
    return VIEWS.get(playerId);
  }
}

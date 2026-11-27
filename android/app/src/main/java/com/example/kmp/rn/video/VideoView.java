package com.example.kmp.rn.video;

import android.content.Context;
import android.view.Gravity;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.exoplayer.ExoPlayer;

/**
 * The video half of the 视频播放 page: an ExoPlayer rendering into a surface this
 * view owns.
 *
 * The surface is a {@link SurfaceView} flagged as a media overlay rather than a
 * `PlayerView`. Two reasons, both learned on the scan preview: a child of React
 * Native's root surface is otherwise composited *below* it (invisible), and the
 * overlay also lets the picture be sized by hand, which a `PlayerView` would do
 * with its own controls — controls this app draws in React Native instead.
 */
public class VideoView extends FrameLayout {

  /** Reported to the page when the media size is known. */
  public interface Listener {
    void onVideoSize(@NonNull VideoView view, int width, int height);
  }

  private final SurfaceView surfaceView;
  private ExoPlayer player;
  private Listener listener;

  private String playerId;
  private String url;
  private boolean paused = true;
  private boolean muted;
  private boolean loop;
  private String resizeMode = "contain";

  private int videoWidth;
  private int videoHeight;
  private String lastError;

  public VideoView(@NonNull Context context) {
    super(context);
    surfaceView = new SurfaceView(context);
    // Draw above React Native's own surface. `setZOrderOnTop` was tried as well
    // (the pip window does not composite the media-overlay layer either) and the
    // window stayed black, so the layering is not the whole story here.
    surfaceView.setZOrderMediaOverlay(true);
    surfaceView.getHolder().addCallback(
        new SurfaceHolder.Callback() {
          @Override
          public void surfaceCreated(@NonNull SurfaceHolder holder) {
            attachSurface(holder.getSurface());
          }

          @Override
          public void surfaceChanged(
              @NonNull SurfaceHolder holder, int format, int width, int height) {
            attachSurface(holder.getSurface());
            layoutSurface();
          }

          @Override
          public void surfaceDestroyed(@NonNull SurfaceHolder holder) {
            if (player != null) {
              player.clearVideoSurface();
            }
          }
        });
    FrameLayout.LayoutParams params =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    params.gravity = Gravity.CENTER;
    addView(surfaceView, params);
  }

  public void setListener(@Nullable Listener listener) {
    this.listener = listener;
  }

  public void setPlayerId(@Nullable String playerId) {
    if (playerId == null || playerId.equals(this.playerId)) {
      return;
    }
    if (this.playerId != null) {
      VideoRegistry.remove(this.playerId, this);
    }
    this.playerId = playerId;
    VideoRegistry.add(playerId, this);
  }

  @Nullable
  public String getPlayerId() {
    return playerId;
  }

  public void setUrl(@Nullable String url) {
    if (url == null || url.equals(this.url)) {
      return;
    }
    this.url = url;
    this.lastError = null;
    ExoPlayer target = ensurePlayer();
    if (target != null) {
      target.setMediaItem(MediaItem.fromUri(url));
      target.prepare();
      target.setPlayWhenReady(!paused);
    }
  }

  public void setPaused(boolean paused) {
    this.paused = paused;
    if (player != null) {
      player.setPlayWhenReady(!paused);
    }
  }

  public void setMuted(boolean muted) {
    this.muted = muted;
    if (player != null) {
      player.setVolume(muted ? 0f : 1f);
    }
  }

  public void setLoop(boolean loop) {
    this.loop = loop;
    if (player != null) {
      player.setRepeatMode(loop ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
    }
  }

  public void setResizeMode(@Nullable String resizeMode) {
    this.resizeMode = resizeMode == null ? "contain" : resizeMode;
    layoutSurface();
  }

  // ---- state read by the VideoPlayer module -------------------------------

  public long getPositionMs() {
    return player == null ? 0 : Math.max(0, player.getCurrentPosition());
  }

  public long getDurationMs() {
    if (player == null) {
      return 0;
    }
    long duration = player.getDuration();
    return duration == C.TIME_UNSET ? 0 : Math.max(0, duration);
  }

  public boolean isPlaying() {
    return player != null && player.isPlaying();
  }

  public boolean hasEnded() {
    return player != null && player.getPlaybackState() == Player.STATE_ENDED;
  }

  public boolean isBuffering() {
    return player != null && player.getPlaybackState() == Player.STATE_BUFFERING;
  }

  @Nullable
  public String getLastError() {
    return lastError;
  }

  public void seekTo(long positionMs) {
    if (player != null) {
      player.seekTo(Math.max(0, positionMs));
    }
  }

  // ---- player lifecycle ---------------------------------------------------

  @Nullable
  private ExoPlayer ensurePlayer() {
    if (player != null) {
      return player;
    }
    ExoPlayer created = new ExoPlayer.Builder(getContext()).build();
    created.setVolume(muted ? 0f : 1f);
    created.setRepeatMode(loop ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
    created.addListener(
        new Player.Listener() {
          @Override
          public void onVideoSizeChanged(@NonNull VideoSize size) {
            videoWidth = size.width;
            videoHeight = size.height;
            layoutSurface();
            if (listener != null && size.width > 0 && size.height > 0) {
              listener.onVideoSize(VideoView.this, size.width, size.height);
            }
          }

          @Override
          public void onPlayerError(@NonNull PlaybackException error) {
            lastError = error.getErrorCodeName();
          }
        });
    player = created;
    attachSurface(surfaceView.getHolder().getSurface());
    if (url != null) {
      created.setMediaItem(MediaItem.fromUri(url));
      created.prepare();
      created.setPlayWhenReady(!paused);
    }
    return created;
  }

  private void attachSurface(@Nullable Surface surface) {
    if (player == null || surface == null || !surface.isValid()) {
      return;
    }
    player.setVideoSurfaceView(surfaceView);
  }

  /** Sizes the surface for the current resize mode and keeps the picture honest. */
  private void layoutSurface() {
    int width = getWidth();
    int height = getHeight();
    if (width <= 0 || height <= 0 || videoWidth <= 0 || videoHeight <= 0) {
      return;
    }
    float videoAspect = videoWidth / (float) videoHeight;
    int surfaceWidth;
    int surfaceHeight;
    if ("cover".equals(resizeMode)) {
      if (width / (float) height > videoAspect) {
        surfaceWidth = width;
        surfaceHeight = Math.round(width / videoAspect);
      } else {
        surfaceHeight = height;
        surfaceWidth = Math.round(height * videoAspect);
      }
    } else {
      if (width / (float) height > videoAspect) {
        surfaceHeight = height;
        surfaceWidth = Math.round(height * videoAspect);
      } else {
        surfaceWidth = width;
        surfaceHeight = Math.round(width / videoAspect);
      }
    }
    surfaceView.getHolder().setFixedSize(surfaceWidth, surfaceHeight);
    surfaceView.setX((width - surfaceWidth) / 2f);
    surfaceView.setY((height - surfaceHeight) / 2f);
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    if (playerId != null) {
      VideoRegistry.add(playerId, this);
    }
    ensurePlayer();
  }

  @Override
  protected void onDetachedFromWindow() {
    if (playerId != null) {
      VideoRegistry.remove(playerId, this);
    }
    if (player != null) {
      player.release();
      player = null;
    }
    super.onDetachedFromWindow();
  }
}

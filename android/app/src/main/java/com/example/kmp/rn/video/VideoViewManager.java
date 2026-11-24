package com.example.kmp.rn.video;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.facebook.react.viewmanagers.VideoViewManagerDelegate;
import com.facebook.react.viewmanagers.VideoViewManagerInterface;

/**
 * Registers {@link VideoView} with Fabric.
 *
 * The props delegate is generated from
 * `src/native/specs/VideoViewNativeComponent.ts`; playback state is not events
 * but the `VideoPlayer` module, which polls the same view through
 * {@link VideoRegistry}.
 */
public class VideoViewManager extends SimpleViewManager<VideoView>
    implements VideoViewManagerInterface<VideoView> {

  public static final String NAME = "VideoView";
  public static final String EVENT_VIDEO_SIZE = "onVideoSize";

  private final ReactApplicationContext reactContext;
  private final ViewManagerDelegate<VideoView> delegate;

  public VideoViewManager(ReactApplicationContext reactContext) {
    this.reactContext = reactContext;
    this.delegate = new VideoViewManagerDelegate<>(this);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @NonNull
  @Override
  protected VideoView createViewInstance(@NonNull ThemedReactContext context) {
    VideoView view = new VideoView(context);
    view.setListener(
        (source, width, height) -> {
          WritableMap payload = Arguments.createMap();
          payload.putInt("width", width);
          payload.putInt("height", height);
          int surfaceId = UIManagerHelper.getSurfaceId(source);
          EventDispatcher dispatcher =
              UIManagerHelper.getEventDispatcherForReactTag(reactContext, source.getId());
          if (dispatcher != null) {
            dispatcher.dispatchEvent(
                new VideoSizeEvent(surfaceId, source.getId(), payload));
          }
        });
    return view;
  }

  @Override
  @Nullable
  protected ViewManagerDelegate<VideoView> getDelegate() {
    return delegate;
  }

  @Override
  public void setPlayerId(VideoView view, @Nullable String value) {
    view.setPlayerId(value);
  }

  @Override
  public void setUrl(VideoView view, @Nullable String value) {
    view.setUrl(value);
  }

  @Override
  public void setPaused(VideoView view, boolean value) {
    view.setPaused(value);
  }

  @Override
  public void setMuted(VideoView view, boolean value) {
    view.setMuted(value);
  }

  @Override
  public void setLoop(VideoView view, boolean value) {
    view.setLoop(value);
  }

  @Override
  public void setResizeMode(VideoView view, @Nullable String value) {
    view.setResizeMode(value);
  }

  private static final class VideoSizeEvent extends Event<VideoSizeEvent> {
    private final WritableMap payload;

    VideoSizeEvent(int surfaceId, int viewTag, WritableMap payload) {
      super(surfaceId, viewTag);
      this.payload = payload;
    }

    @NonNull
    @Override
    public String getEventName() {
      return EVENT_VIDEO_SIZE;
    }

    @Override
    public void dispatch(RCTEventEmitter emitter) {
      emitter.receiveEvent(getViewTag(), getEventName(), payload);
    }

    @Nullable
    @Override
    protected WritableMap getEventData() {
      return payload;
    }
  }
}

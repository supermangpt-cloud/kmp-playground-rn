package com.example.kmp.rn.scanner;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.facebook.react.viewmanagers.ScannerViewManagerDelegate;
import com.facebook.react.viewmanagers.ScannerViewManagerInterface;

import java.util.Map;

/**
 * Registers {@link ScannerView} with Fabric.
 *
 * The method map and the props delegate are generated from
 * `src/native/specs/ScannerViewNativeComponent.ts`; the events are dispatched
 * here by name, which is how a codegen-only component reports back.
 */
public class ScannerViewManager extends SimpleViewManager<ScannerView>
    implements ScannerViewManagerInterface<ScannerView> {

  public static final String NAME = "ScannerView";

  /** `onDecoded` in the spec. */
  public static final String EVENT_DECODED = "onDecoded";
  /** `onFailed` in the spec. */
  public static final String EVENT_FAILED = "onFailed";
  /** `onReady` in the spec. */
  public static final String EVENT_READY = "onReady";

  private final ReactApplicationContext reactContext;
  private final ViewManagerDelegate<ScannerView> delegate;

  public ScannerViewManager(ReactApplicationContext reactContext) {
    this.reactContext = reactContext;
    this.delegate = new ScannerViewManagerDelegate<>(this);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @NonNull
  @Override
  protected ScannerView createViewInstance(@NonNull ThemedReactContext context) {
    ScannerView view = new ScannerView(context);
    view.setListener(
        new ScannerView.Listener() {
          @Override
          public void onDecoded(@NonNull ScannerView source, @NonNull String value) {
            WritableMap payload = Arguments.createMap();
            payload.putString("value", value);
            dispatch(source, EVENT_DECODED, payload);
          }

          @Override
          public void onFailed(@NonNull ScannerView source, @NonNull String reason) {
            WritableMap payload = Arguments.createMap();
            payload.putString("reason", reason);
            dispatch(source, EVENT_FAILED, payload);
          }

          @Override
          public void onReady(@NonNull ScannerView source, int width, int height) {
            WritableMap payload = Arguments.createMap();
            payload.putInt("width", width);
            payload.putInt("height", height);
            dispatch(source, EVENT_READY, payload);
          }
        });
    return view;
  }

  @Override
  @Nullable
  protected ViewManagerDelegate<ScannerView> getDelegate() {
    return delegate;
  }

  @Override
  public void setFacing(ScannerView view, @Nullable String value) {
    view.setFacing(value);
  }

  private void dispatch(ScannerView view, String eventName, WritableMap payload) {
    int surfaceId = UIManagerHelper.getSurfaceId(view);
    EventDispatcher dispatcher =
        UIManagerHelper.getEventDispatcherForReactTag(reactContext, view.getId());
    if (dispatcher == null) {
      return;
    }
    dispatcher.dispatchEvent(new ScannerEvent(surfaceId, view.getId(), eventName, payload));
  }

  /** One event of this component; the name is given by the spec's prop. */
  private static final class ScannerEvent extends Event<ScannerEvent> {
    private final String name;
    private final WritableMap payload;

    ScannerEvent(int surfaceId, int viewTag, String name, WritableMap payload) {
      super(surfaceId, viewTag);
      this.name = name;
      this.payload = payload;
    }

    @NonNull
    @Override
    public String getEventName() {
      return name;
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

package com.example.kmp.rn.scanner;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.util.AttributeSet;
import android.util.Log;
import android.util.Size;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.AspectRatio;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The camera half of the 扫一扫 page, as a Fabric view.
 *
 * This view owns nothing but the preview and the decoder: the header, the
 * aiming frame, the hint and 取消 are React Native views in `ScanScreen`, so the
 * screen keeps the app's own look instead of the platform's.
 *
 * It is deliberately a `FrameLayout` around a `PreviewView` rather than a
 * `PreviewView` subclass: the surrounding layout is React Native's, so the view
 * only has to fill whatever box the page gives it.
 */
public class ScannerView extends FrameLayout {

  /** Called with the raw text of the first QR read after the view attached. */
  public interface Listener {
    void onDecoded(@NonNull ScannerView view, @NonNull String value);

    void onFailed(@NonNull ScannerView view, @NonNull String reason);

    void onReady(@NonNull ScannerView view, int width, int height);
  }

  private final SurfaceView surfaceView;
  private Preview previewUseCase;
  private Surface surface;
  private ExecutorService analyzer;
  private BarcodeScanner scanner;
  private ProcessCameraProvider cameraProvider;
  private Listener listener;
  private boolean started;
  private String facing = "back";

  public ScannerView(@NonNull Context context) {
    this(context, null);
  }

  public ScannerView(@NonNull Context context, @Nullable AttributeSet attrs) {
    super(context, attrs);
    // The Android root view of a bridgeless React Native app is a ReactSurfaceView
    // (a SurfaceView). A TextureView nested in it never receives a usable
    // surface — CameraX fails with 「Unable to configure camera 0, timeout!」 —
    // and a plain SurfaceView child is composited *below* the root's surface, so
    // the preview is invisible. A SurfaceView flagged as a media overlay is drawn
    // above the app's surface, which is what the camera needs here.
    surfaceView = new SurfaceView(context);
    surfaceView.setZOrderMediaOverlay(true);
    surfaceView.getHolder().addCallback(new SurfaceHolder.Callback() {
      @Override
      public void surfaceCreated(@NonNull SurfaceHolder holder) {
        surface = holder.getSurface();
        attachPreviewSurface();
      }

      @Override
      public void surfaceChanged(@NonNull SurfaceHolder holder, int format, int width, int height) {
        surface = holder.getSurface();
        attachPreviewSurface();
      }

      @Override
      public void surfaceDestroyed(@NonNull SurfaceHolder holder) {
        surface = null;
      }
    });
    FrameLayout.LayoutParams surfaceParams =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    surfaceParams.gravity = Gravity.CENTER;
    addView(surfaceView, surfaceParams);
  }

  public void setListener(@Nullable Listener listener) {
    this.listener = listener;
  }

  public void setFacing(@Nullable String facing) {
    this.facing = facing == null ? "back" : facing;
  }


  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    start();
  }

  @Override
  protected void onDetachedFromWindow() {
    stop();
    super.onDetachedFromWindow();
  }

  private void start() {
    if (started) {
      return;
    }
    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
        != PackageManager.PERMISSION_GRANTED) {
      listenerFailed("未授予相机权限：请在系统设置中允许本 App 使用相机后重试");
      return;
    }
    LifecycleOwner owner = lifecycleOwner();
    if (owner == null) {
      listenerFailed("当前页面没有生命周期，无法打开相机");
      return;
    }
    started = true;
    analyzer = Executors.newSingleThreadExecutor();
    scanner =
        BarcodeScanning.getClient(
            new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build());

    ListenableFuture<ProcessCameraProvider> future =
        ProcessCameraProvider.getInstance(getContext());
    future.addListener(
        () -> {
          try {
            cameraProvider = future.get();
          } catch (Exception failed) {
            listenerFailed("相机启动失败：" + failed.getMessage());
            return;
          }
          // A fixed 4:3 stream plus a matching view box is what keeps the preview
          // from stretching: a raw SurfaceView has no PreviewView to scale and
          // centre-crop the buffer for it.
          Preview preview =
              new Preview.Builder().setTargetAspectRatio(AspectRatio.RATIO_4_3).build();
          previewUseCase = preview;

          ImageAnalysis analysis =
              new ImageAnalysis.Builder()
                  .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                  .build();
          analysis.setAnalyzer(analyzer, this::analyze);

          cameraProvider.unbindAll();
          cameraProvider.bindToLifecycle(owner, selector(), preview, analysis);
          attachPreviewSurface();
          listenerReady(getWidth(), getHeight());
        },
        ContextCompat.getMainExecutor(getContext()));
  }

  /**
   * Sizes the surface for the buffer CameraX is about to fill, then hands it over.
   *
   * A raw SurfaceView has none of PreviewView's scaling: it draws the buffer
   * across whatever surface it has, so a 4:3 stream in a taller box is
   * stretched. The surface is therefore fixed to the stream's aspect (rotated
   * for portrait) and scaled to *cover* this view, with the overflow centred and
   * clipped by the parent.
   */
  private void attachPreviewSurface() {
    Preview preview = previewUseCase;
    Surface target = surface;
    if (preview == null || target == null || !target.isValid()) {
      return;
    }
    preview.setSurfaceProvider(
        request -> {
          Size resolution = request.getResolution();
          applyCoverSize(resolution.getWidth(), resolution.getHeight());
          request.provideSurface(
              target,
              ContextCompat.getMainExecutor(getContext()),
              result -> {
                // Nothing to do: the surface belongs to this view and is only
                // released when it detaches.
              });
        });
  }

  /** Fixes the surface to the stream's aspect and centres the cropped overflow. */
  private void applyCoverSize(int bufferWidth, int bufferHeight) {
    int viewWidth = getWidth();
    int viewHeight = getHeight();
    if (bufferWidth <= 0 || bufferHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) {
      return;
    }
    // The sensor buffer is landscape; the view is portrait, so the stream's
    // portrait aspect is height/width.
    // Whichever way round the buffer arrives, the displayed aspect is the short
    // side over the long side.
    float portraitAspect =
        Math.min(bufferWidth, bufferHeight) / (float) Math.max(bufferWidth, bufferHeight);
    int surfaceWidth;
    int surfaceHeight;
    if (viewWidth / (float) viewHeight > portraitAspect) {
      surfaceWidth = viewWidth;
      surfaceHeight = Math.round(viewWidth / portraitAspect);
    } else {
      surfaceHeight = viewHeight;
      surfaceWidth = Math.round(viewHeight * portraitAspect);
    }
    surfaceView.getHolder().setFixedSize(surfaceWidth, surfaceHeight);
    surfaceView.setX((viewWidth - surfaceWidth) / 2f);
    surfaceView.setY((viewHeight - surfaceHeight) / 2f);
  }

  private CameraSelector selector() {
    return "front".equals(facing)
        ? CameraSelector.DEFAULT_FRONT_CAMERA
        : CameraSelector.DEFAULT_BACK_CAMERA;
  }

  private void analyze(ImageProxy proxy) {
    if (!started || scanner == null) {
      proxy.close();
      return;
    }
    if (proxy.getImage() == null) {
      proxy.close();
      return;
    }
    InputImage image =
        InputImage.fromMediaImage(proxy.getImage(), proxy.getImageInfo().getRotationDegrees());
    scanner
        .process(image)
        .addOnSuccessListener(
            barcodes -> {
              for (Barcode barcode : barcodes) {
                String value = barcode.getRawValue();
                if (value != null && !value.isEmpty()) {
                  Listener target = listener;
                  if (target != null) {
                    target.onDecoded(this, value);
                  }
                  break;
                }
              }
            })
        .addOnCompleteListener(task -> proxy.close());
  }

  private void stop() {
    started = false;
    previewUseCase = null;
    if (cameraProvider != null) {
      cameraProvider.unbindAll();
      cameraProvider = null;
    }
    if (scanner != null) {
      scanner.close();
      scanner = null;
    }
    if (analyzer != null) {
      analyzer.shutdown();
      analyzer = null;
    }
  }

  @Nullable
  private LifecycleOwner lifecycleOwner() {
    Context context = getContext();
    while (context != null) {
      if (context instanceof LifecycleOwner) {
        return (LifecycleOwner) context;
      }
      if (!(context instanceof android.content.ContextWrapper)) {
        return null;
      }
      context = ((android.content.ContextWrapper) context).getBaseContext();
    }
    return null;
  }

  private void listenerFailed(@NonNull String reason) {
    Listener target = listener;
    if (target != null) {
      target.onFailed(this, reason);
    }
  }

  private void listenerReady(int width, int height) {
    Listener target = listener;
    if (target != null) {
      target.onReady(this, width, height);
    }
  }
}

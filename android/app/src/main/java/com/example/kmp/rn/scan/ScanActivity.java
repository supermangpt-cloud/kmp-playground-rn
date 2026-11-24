package com.example.kmp.rn.scan;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The self-drawn scanner behind the 扫一扫 chip, the Android counterpart of the
 * HarmonyOS ArkTS `ScanPage`.
 *
 * The screen is built in code instead of XML so it carries the same pieces the
 * ArkTS page shows: the title, the hint under the frame, and 取消. The camera
 * runs through CameraX with ML Kit's on-device QR model, which is the same
 * pairing the KMP Android build uses (`ScanPreview.android.kt`).
 */
public class ScanActivity extends AppCompatActivity {

  public static final String EXTRA_STATUS = "status";
  public static final String EXTRA_VALUE = "value";
  public static final String EXTRA_REASON = "reason";

  private static final int CAMERA_REQUEST = 41;

  private PreviewView previewView;
  private TextView hint;
  private final AtomicBoolean finished = new AtomicBoolean(false);
  private ExecutorService analyzer;
  private BarcodeScanner scanner;
  private ProcessCameraProvider cameraProvider;

  @Override
  protected void onCreate(@Nullable Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    setContentView(buildContent());
    if (!hasCamera()) {
      ActivityCompat.requestPermissions(
          this, new String[] {Manifest.permission.CAMERA}, CAMERA_REQUEST);
      return;
    }
    startCamera();
  }

  private View buildContent() {
    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.parseColor("#101010"));

    previewView = new PreviewView(this);
    previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
    root.addView(
        previewView,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    LinearLayout column = new LinearLayout(this);
    column.setOrientation(LinearLayout.VERTICAL);
    column.setGravity(Gravity.CENTER_HORIZONTAL);
    column.setPadding(dp(20), dp(40), dp(20), dp(28));

    TextView title = new TextView(this);
    title.setText("扫一扫");
    title.setTextColor(Color.WHITE);
    title.setTextSize(20);
    column.addView(title);

    // The square the user aims with. It is a frame, not a cut-out: ML Kit reads
    // the whole frame, so a code outside the box still decodes.
    View frame = new View(this);
    android.graphics.drawable.GradientDrawable border =
        new android.graphics.drawable.GradientDrawable();
    border.setColor(Color.TRANSPARENT);
    border.setStroke(dp(2), Color.parseColor("#4CAF50"));
    border.setCornerRadius(dp(12));
    frame.setBackground(border);
    LinearLayout.LayoutParams frameParams = new LinearLayout.LayoutParams(dp(240), dp(240));
    frameParams.topMargin = dp(24);
    column.addView(frame, frameParams);

    hint = new TextView(this);
    hint.setText("将二维码放入框内，即可自动识别");
    hint.setTextColor(Color.parseColor("#DDDDDD"));
    hint.setTextSize(13);
    LinearLayout.LayoutParams hintParams =
        new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    hintParams.topMargin = dp(16);
    column.addView(hint, hintParams);

    Button cancel = new Button(this);
    cancel.setText("取消");
    cancel.setAllCaps(false);
    cancel.setOnClickListener(v -> finishWith(EXTRA_STATUS_CANCELLED, null, null));
    LinearLayout.LayoutParams cancelParams =
        new LinearLayout.LayoutParams(dp(160), ViewGroup.LayoutParams.WRAP_CONTENT);
    cancelParams.topMargin = dp(24);
    column.addView(cancel, cancelParams);

    FrameLayout.LayoutParams columnParams =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    columnParams.gravity = Gravity.TOP;
    root.addView(column, columnParams);
    return root;
  }

  private static final String EXTRA_STATUS_CANCELLED = "cancelled";

  private boolean hasCamera() {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED;
  }

  @Override
  public void onRequestPermissionsResult(
      int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != CAMERA_REQUEST) {
      return;
    }
    if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
      startCamera();
      return;
    }
    finishWith(EXTRA_STATUS_FAILED, null, "未授予相机权限：请在系统设置中允许本 App 使用相机后重试");
  }

  @SuppressLint("UnsafeOptInUsageError")
  private void startCamera() {
    analyzer = Executors.newSingleThreadExecutor();
    scanner =
        BarcodeScanning.getClient(
            new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build());

    ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
    future.addListener(
        () -> {
          try {
            cameraProvider = future.get();
          } catch (Exception failed) {
            finishWith(EXTRA_STATUS_FAILED, null, "相机启动失败：" + failed.getMessage());
            return;
          }
          Preview preview = new Preview.Builder().build();
          preview.setSurfaceProvider(previewView.getSurfaceProvider());

          ImageAnalysis analysis =
              new ImageAnalysis.Builder()
                  .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                  .setTargetResolution(new Size(1280, 720))
                  .build();
          analysis.setAnalyzer(analyzer, this::analyze);

          cameraProvider.unbindAll();
          cameraProvider.bindToLifecycle(
              this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
        },
        ContextCompat.getMainExecutor(this));
  }

  private void analyze(ImageProxy proxy) {
    if (finished.get()) {
      proxy.close();
      return;
    }
    if (proxy.getImage() == null) {
      proxy.close();
      return;
    }
    InputImage image = InputImage.fromMediaImage(proxy.getImage(), proxy.getImageInfo().getRotationDegrees());
    scanner
        .process(image)
        .addOnSuccessListener(
            barcodes -> {
              for (Barcode barcode : barcodes) {
                String value = barcode.getRawValue();
                if (value != null && !value.isEmpty()) {
                  finishWith(EXTRA_STATUS_OK, value, null);
                  break;
                }
              }
            })
        .addOnCompleteListener(task -> proxy.close());
  }

  private void finishWith(String status, @Nullable String value, @Nullable String reason) {
    if (!finished.compareAndSet(false, true)) {
      return;
    }
    Intent result = new Intent();
    result.putExtra(EXTRA_STATUS, status);
    if (value != null) {
      result.putExtra(EXTRA_VALUE, value);
    }
    if (reason != null) {
      result.putExtra(EXTRA_REASON, reason);
    }
    setResult(RESULT_OK, result);
    stopCamera();
    finish();
  }

  private static final String EXTRA_STATUS_OK = "ok";
  private static final String EXTRA_STATUS_FAILED = "failed";

  private void stopCamera() {
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

  @Override
  protected void onDestroy() {
    super.onDestroy();
    stopCamera();
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }
}

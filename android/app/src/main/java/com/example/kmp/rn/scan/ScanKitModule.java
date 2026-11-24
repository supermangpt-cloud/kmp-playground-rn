package com.example.kmp.rn.scan;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Android face of the app's `ScanKit` module.
 *
 * `startScanner` opens {@link ScanActivity} — the same self-drawn screen the
 * HarmonyOS build shows — and resolves with the payload `src/native/scanKit.ts`
 * already understands (`{status, value, reason}`). `decodeImage` reads a QR out
 * of a picked file with ML Kit's on-device model.
 *
 * The adapted Scan Kit har is HarmonyOS-only, so this is written against
 * CameraX + ML Kit, the same pairing the KMP Android build uses.
 */
public class ScanKitModule extends ReactContextBaseJavaModule implements ActivityEventListener {

  private static final String NAME = "ScanKit";
  private static final int SCAN_REQUEST = 4711;

  private final ReactApplicationContext reactContext;
  private Promise pending;

  public ScanKitModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
    reactContext.addActivityEventListener(this);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void startScanner(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      WritableMap failed = Arguments.createMap();
      failed.putString("status", "failed");
      failed.putString("reason", "当前没有可用的界面");
      promise.resolve(failed);
      return;
    }
    if (pending != null) {
      WritableMap busy = Arguments.createMap();
      busy.putString("status", "failed");
      busy.putString("reason", "扫码页已经打开");
      promise.resolve(busy);
      return;
    }
    pending = promise;
    activity.startActivityForResult(new Intent(activity, ScanActivity.class), SCAN_REQUEST);
  }

  /** Kept so the JS wrapper keeps one shape on every platform. */
  @ReactMethod
  public void startSystemScanner(Promise promise) {
    startScanner(promise);
  }

  @ReactMethod
  public void decodeImage(String uri, Promise promise) {
    Uri parsed;
    try {
      parsed = Uri.parse(uri);
    } catch (Exception malformed) {
      promise.resolve(errorPayload("地址无法解析：" + uri));
      return;
    }
    InputImage image;
    try {
      image = InputImage.fromFilePath(reactContext, parsed);
    } catch (IOException failed) {
      promise.resolve(errorPayload("这张图片无法读取：" + failed.getMessage()));
      return;
    }
    BarcodeScanner scanner =
        BarcodeScanning.getClient(
            new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build());
    scanner
        .process(image)
        .addOnSuccessListener(
            barcodes -> {
              List<String> values = new ArrayList<>();
              for (Barcode barcode : barcodes) {
                String value = barcode.getRawValue();
                if (value != null && !value.isEmpty()) {
                  values.add(value);
                }
              }
              WritableMap payload = Arguments.createMap();
              if (values.isEmpty()) {
                payload.putString("error", "这张图片里没有识别到二维码");
              } else {
                com.facebook.react.bridge.WritableArray array = Arguments.createArray();
                for (String value : values) {
                  array.pushString(value);
                }
                payload.putArray("values", array);
              }
              promise.resolve(payload);
            })
        .addOnFailureListener(
            failed -> promise.resolve(errorPayload("从图片解析二维码失败：" + failed.getMessage())))
        .addOnCompleteListener(task -> scanner.close());
  }

  private WritableMap errorPayload(String reason) {
    WritableMap payload = Arguments.createMap();
    payload.putString("error", reason);
    return payload;
  }

  @Override
  public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
    if (requestCode != SCAN_REQUEST || pending == null) {
      return;
    }
    Promise promise = pending;
    pending = null;
    WritableMap payload = Arguments.createMap();
    if (resultCode != Activity.RESULT_OK || data == null) {
      payload.putString("status", "cancelled");
      promise.resolve(payload);
      return;
    }
    payload.putString("status", data.getStringExtra(ScanActivity.EXTRA_STATUS));
    String value = data.getStringExtra(ScanActivity.EXTRA_VALUE);
    if (value != null) {
      payload.putString("value", value);
    }
    String reason = data.getStringExtra(ScanActivity.EXTRA_REASON);
    if (reason != null) {
      payload.putString("reason", reason);
    }
    promise.resolve(payload);
  }

  @Override
  public void onNewIntent(Intent intent) {
    // Single-top is not used for the scan screen; nothing to do.
  }
}

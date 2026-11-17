package com.example.kmp.rn.capabilities;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Writes one PNG into the system album, mirroring the HarmonyOS `ImageSave`
 * module's payload so `src/native/imageSave.ts` stays platform-neutral.
 *
 * Android 10+ uses MediaStore with a relative path under Pictures, which needs
 * no storage permission for files the app creates itself. Android 9 and below
 * writes into the public Pictures directory and needs WRITE_EXTERNAL_STORAGE,
 * reported as `permissionDenied` so the page can offer 去设置.
 */
public class ImageSaveModule extends ReactContextBaseJavaModule {

  private static final byte[] PNG_SIGNATURE = {
    (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  };

  public ImageSaveModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "ImageSave";
  }

  @ReactMethod
  public void saveImage(String base64, String title, Promise promise) {
    if (base64 == null || base64.isEmpty()) {
      promise.resolve(failure(false, "没有可保存的 PNG 内容"));
      return;
    }
    byte[] bytes;
    try {
      bytes = Base64.decode(base64, Base64.DEFAULT);
    } catch (IllegalArgumentException error) {
      promise.resolve(failure(false, "PNG base64 解码失败：" + error.getMessage()));
      return;
    }
    if (!hasPngSignature(bytes)) {
      promise.resolve(failure(false, "传入的内容不是 PNG"));
      return;
    }
    String safeTitle = safeTitle(title);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      saveWithMediaStore(bytes, safeTitle, promise);
    } else {
      saveToPublicPictures(bytes, safeTitle, promise);
    }
  }

  private void saveWithMediaStore(byte[] bytes, String title, Promise promise) {
    ContentResolver resolver = getReactApplicationContext().getContentResolver();
    Uri uri = null;
    try {
      ContentValues values = new ContentValues();
      values.put(MediaStore.Images.Media.DISPLAY_NAME, title + ".png");
      values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
      values.put(
          MediaStore.Images.Media.RELATIVE_PATH,
          Environment.DIRECTORY_PICTURES + File.separator + "KmpPlaygroundRn");
      values.put(MediaStore.Images.Media.IS_PENDING, 1);
      uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
      if (uri == null) {
        promise.resolve(failure(false, "写入相册失败：MediaStore 没有返回资源 URI"));
        return;
      }
      try (OutputStream stream = resolver.openOutputStream(uri, "w")) {
        if (stream == null) {
          promise.resolve(failure(false, "写入相册失败：无法打开相册资源"));
          return;
        }
        stream.write(bytes);
        stream.flush();
      }
      ContentValues done = new ContentValues();
      done.put(MediaStore.Images.Media.IS_PENDING, 0);
      resolver.update(uri, done, null, null);
      verifyAndResolve(uri, bytes, title, promise);
    } catch (Exception error) {
      if (uri != null) {
        try {
          resolver.delete(uri, null, null);
        } catch (Exception ignored) {
          // Best effort: the failure below is the one worth reporting.
        }
      }
      promise.resolve(failure(false, "写入相册失败：" + error.getMessage()));
    }
  }

  private void verifyAndResolve(Uri uri, byte[] bytes, String title, Promise promise) {
    try (InputStream stream = getReactApplicationContext().getContentResolver().openInputStream(uri)) {
      if (stream == null) {
        promise.resolve(failure(false, "相册资源写入后无法读回"));
        return;
      }
      byte[] read = new byte[bytes.length];
      int offset = 0;
      int count;
      while (offset < read.length && (count = stream.read(read, offset, read.length - offset)) > 0) {
        offset += count;
      }
      if (offset != bytes.length) {
        promise.resolve(
            failure(
                false,
                "相册资源大小不符：应写入 " + bytes.length + " 字节，实际 " + offset + " 字节"));
        return;
      }
      if (!hasPngSignature(read)) {
        promise.resolve(failure(false, "相册资源校验失败：读回的字节不是 PNG"));
        return;
      }
      WritableMap payload = Arguments.createMap();
      payload.putBoolean("saved", true);
      payload.putString("uri", uri.toString());
      payload.putString("title", title);
      payload.putBoolean("permissionDenied", false);
      payload.putString("reason", "");
      promise.resolve(payload);
    } catch (Exception error) {
      promise.resolve(failure(false, "相册资源写入后校验失败：" + error.getMessage()));
    }
  }

  private void saveToPublicPictures(byte[] bytes, String title, Promise promise) {
    Context context = getReactApplicationContext();
    if (context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        != PackageManager.PERMISSION_GRANTED) {
      promise.resolve(
          failure(
              true,
              "Android 10 以下需要存储写入权限（WRITE_EXTERNAL_STORAGE）"));
      return;
    }
    try {
      File pictures =
          Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
      File directory = new File(pictures, "KmpPlaygroundRn");
      if (!directory.exists() && !directory.mkdirs()) {
        promise.resolve(failure(false, "无法创建相册目录：" + directory.getAbsolutePath()));
        return;
      }
      File file = new File(directory, title + ".png");
      try (FileOutputStream stream = new FileOutputStream(file)) {
        stream.write(bytes);
        stream.flush();
      }
      MediaScannerConnection.scanFile(
          context, new String[] {file.getAbsolutePath()}, new String[] {"image/png"}, null);
      WritableMap payload = Arguments.createMap();
      payload.putBoolean("saved", true);
      payload.putString("uri", Uri.fromFile(file).toString());
      payload.putString("title", title);
      payload.putBoolean("permissionDenied", false);
      payload.putString("reason", "");
      promise.resolve(payload);
    } catch (Exception error) {
      promise.resolve(failure(false, "写入相册失败：" + error.getMessage()));
    }
  }

  private WritableMap failure(boolean permissionDenied, String reason) {
    WritableMap payload = Arguments.createMap();
    payload.putBoolean("saved", false);
    payload.putString("uri", "");
    payload.putString("title", "");
    payload.putBoolean("permissionDenied", permissionDenied);
    payload.putString("reason", reason);
    return payload;
  }

  private boolean hasPngSignature(byte[] bytes) {
    if (bytes.length < PNG_SIGNATURE.length) {
      return false;
    }
    for (int index = 0; index < PNG_SIGNATURE.length; index++) {
      if (bytes[index] != PNG_SIGNATURE[index]) {
        return false;
      }
    }
    return true;
  }

  private String safeTitle(String title) {
    String value = title == null ? "" : title.trim().replaceAll("[\\\\/:*?\"<>|]", "-");
    if (value.isEmpty()) {
      value = "qr-code";
    }
    return value.length() > 80 ? value.substring(0, 80) : value;
  }
}

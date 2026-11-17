package com.example.kmp.rn.capabilities;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.PermissionAwareActivity;
import com.facebook.react.modules.core.PermissionListener;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The Android implementation of the capability page's `CapabilityProbe`.
 *
 * The method names and payloads mirror the HarmonyOS ArkTS module
 * (`CapabilityProbeTurboModule.ets`) and are validated by the JS wrappers in
 * `src/native/`, so the page's formatting logic is shared by every platform.
 * The JS side calls this through the legacy `NativeModules` table; see
 * `src/native/turboModule.ts`.
 *
 * Permission semantics follow the JS contract's three states. Android has no
 * "not determined" query of its own, so the module records the first request in
 * SharedPreferences (the same trick the HarmonyOS module uses) and answers
 * `notDetermined` until then.
 */
public class CapabilityProbeModule extends ReactContextBaseJavaModule
    implements PermissionListener {

  private static final String STORE_NAME = "platform_capabilities";
  private static final String REQUESTED_PREFIX = "permission_requested_";
  private static final int PERMISSION_REQUEST_CODE = 7301;

  /** The one permission request currently waiting for its activity result. */
  @Nullable private Promise pendingPermission;
  @Nullable private String pendingPermissionId;

  public CapabilityProbeModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "CapabilityProbe";
  }

  // ---------------------------------------------------------------- device

  @ReactMethod
  public void readDeviceInfo(Promise promise) {
    try {
      Context context = getReactApplicationContext();
      ApplicationInfo info = context.getApplicationInfo();
      PackageManager packages = context.getPackageManager();
      WritableMap payload = Arguments.createMap();
      payload.putString("model", Build.MODEL);
      payload.putString("systemName", "Android");
      payload.putString("systemVersion", Build.VERSION.RELEASE);
      payload.putString("appName", packages.getApplicationLabel(info).toString());
      payload.putString("appVersion", packages.getPackageInfo(context.getPackageName(), 0).versionName);
      promise.resolve(payload);
    } catch (Exception error) {
      promise.reject("device_info_failed", "读取设备信息失败：" + error.getMessage());
    }
  }

  @ReactMethod
  public void readNetworkStatus(Promise promise) {
    try {
      ConnectivityManager manager =
          (ConnectivityManager) getReactApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
      boolean connected = false;
      String type = "none";
      if (manager != null) {
        Network network = manager.getActiveNetwork();
        NetworkCapabilities capabilities =
            network == null ? null : manager.getNetworkCapabilities(network);
        if (capabilities != null) {
          connected = true;
          type = "unknown";
          if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
            type = "wifi";
          } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
            type = "cellular";
          } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
            type = "ethernet";
          }
        }
      }
      WritableMap payload = Arguments.createMap();
      payload.putBoolean("connected", connected);
      payload.putString("type", type);
      promise.resolve(payload);
    } catch (Exception error) {
      promise.reject("network_status_failed", "读取网络状态失败：" + error.getMessage());
    }
  }

  // ----------------------------------------------------------- directories

  @ReactMethod
  public void readDirectories(boolean requestPermissions, Promise promise) {
    // No Android runtime permission is needed to read these paths; the public
    // directories are scoped-storage limited for writing, which the notes say.
    try {
      Context context = getReactApplicationContext();
      WritableArray rows = Arguments.createArray();
      rows.pushMap(directory("Cache", context.getCacheDir().getAbsolutePath(), ""));
      rows.pushMap(directory("Files", context.getFilesDir().getAbsolutePath(), ""));
      File databases = context.getDatabasePath("app.db").getParentFile();
      rows.pushMap(
          directory(
              "Database",
              databases == null ? "" : databases.getAbsolutePath(),
              databases == null ? "这个应用还没有数据库目录" : ""));
      rows.pushMap(
          directory(
              "Temp",
              context.getCacheDir().getAbsolutePath(),
              "Android 没有独立临时目录，临时文件放在缓存目录"));
      rows.pushMap(
          directory(
              "Downloads",
              Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                  .getAbsolutePath(),
              "公共目录；Android 10+ 的分区存储下应用只能读写自己创建的文件"));
      rows.pushMap(
          directory(
              "Documents",
              Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
                  .getAbsolutePath(),
              "公共目录；Android 10+ 的分区存储下应用只能读写自己创建的文件"));
      rows.pushMap(
          directory(
              "PhotoAlbum",
              "",
              "Android 相册通过 MediaStore 的 content:// URI 访问，没有可直接使用的目录路径"));
      promise.resolve(rows);
    } catch (Exception error) {
      promise.reject("directories_failed", "读取存储目录失败：" + error.getMessage());
    }
  }

  private WritableMap directory(String kind, String path, String note) {
    File file = path.isEmpty() ? null : new File(path);
    WritableMap row = Arguments.createMap();
    row.putString("kind", kind);
    row.putString("path", path);
    row.putBoolean("exists", file != null && file.exists());
    row.putString("note", note);
    return row;
  }

  // --------------------------------------------------------------- haptics

  @ReactMethod
  public void vibrateHaptic(String strength, Promise promise) {
    long duration;
    switch (strength == null ? "" : strength) {
      case "light":
        duration = 15L;
        break;
      case "medium":
        duration = 40L;
        break;
      case "heavy":
        duration = 80L;
        break;
      default:
        promise.reject("haptics_failed", "未知的震动档位：" + strength);
        return;
    }
    try {
      Vibrator vibrator = vibrator();
      if (vibrator == null || !vibrator.hasVibrator()) {
        promise.reject("haptics_failed", "该设备没有振动马达，无法触发震动");
        return;
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
      } else {
        vibrator.vibrate(duration);
      }
      WritableMap payload = Arguments.createMap();
      payload.putBoolean("fired", true);
      payload.putString("note", "");
      promise.resolve(payload);
    } catch (Exception error) {
      promise.reject("haptics_failed", "触发震动失败：" + error.getMessage());
    }
  }

  @Nullable
  private Vibrator vibrator() {
    Context context = getReactApplicationContext();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
      return manager == null ? null : manager.getDefaultVibrator();
    }
    return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
  }

  // ----------------------------------------------------------------- share

  @ReactMethod
  public void shareText(String text, Promise promise) {
    String value = text == null ? "" : text.trim();
    if (value.isEmpty()) {
      promise.reject("share_failed", "没有可分享的文本");
      return;
    }
    try {
      Intent send = new Intent(Intent.ACTION_SEND);
      send.setType("text/plain");
      send.putExtra(Intent.EXTRA_TEXT, text);
      Intent chooser = Intent.createChooser(send, null);
      Activity activity = getCurrentActivity();
      if (activity == null) {
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(chooser);
      } else {
        activity.startActivity(chooser);
      }
      // Resolves once the chooser was handed to the system; Android does not
      // report which target the user picked, so "opened" is the honest result.
      promise.resolve(null);
    } catch (Exception error) {
      promise.reject("share_failed", "拉起系统分享面板失败：" + error.getMessage());
    }
  }

  // ----------------------------------------------------------- permissions

  @ReactMethod
  public void readPermissionState(String permission, Promise promise) {
    try {
      String id = permission == null ? "" : permission;
      if ("notifications".equals(id)) {
        promise.resolve(notificationState());
        return;
      }
      String[] names = permissionNames(id);
      if (isGranted(id, names)) {
        promise.resolve("granted");
        return;
      }
      promise.resolve(wasRequested(id) ? "denied" : "notDetermined");
    } catch (Exception error) {
      promise.reject("permission_read_failed", error.getMessage());
    }
  }

  @ReactMethod
  public void requestPermission(String permission, Promise promise) {
    String id = permission == null ? "" : permission;
    try {
      if ("notifications".equals(id) && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        // No runtime dialog below Android 13; the system settings page is the
        // only place the switch can be changed, so open it and report the
        // current state instead of pretending a dialog was shown.
        markRequested(id);
        openNotificationSettings();
        promise.resolve(notificationState());
        return;
      }
      final String[] names = permissionNames(id);
      if (isGranted(id, names)) {
        promise.resolve("granted");
        return;
      }
      PermissionAwareActivity activity = permissionActivity();
      if (activity == null) {
        promise.reject("permission_request_failed", "当前没有可用的 Activity，无法申请权限");
        return;
      }
      if (pendingPermission != null) {
        promise.reject("permission_request_failed", "上一次权限申请还没有返回");
        return;
      }
      pendingPermission = promise;
      pendingPermissionId = id;
      markRequested(id);
      activity.requestPermissions(names, PERMISSION_REQUEST_CODE, this);
    } catch (Exception error) {
      pendingPermission = null;
      pendingPermissionId = null;
      promise.reject("permission_request_failed", "申请权限失败：" + error.getMessage());
    }
  }

  @Override
  public boolean onRequestPermissionsResult(
      int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != PERMISSION_REQUEST_CODE) {
      return false;
    }
    Promise promise = pendingPermission;
    String id = pendingPermissionId;
    pendingPermission = null;
    pendingPermissionId = null;
    if (promise == null || id == null) {
      return true;
    }
    boolean granted = grantResults.length > 0;
    for (int result : grantResults) {
      if (result != PackageManager.PERMISSION_GRANTED) {
        granted = false;
        break;
      }
    }
    // Location is usable when either accuracy level was granted; Android 12
    // asks for both in one dialog and the user may pick approximate only.
    if (!granted && "location".equals(id)) {
      granted = granted("android.permission.ACCESS_COARSE_LOCATION");
    }
    if (!granted && "wifi_scan".equals(id)) {
      granted = granted("android.permission.ACCESS_COARSE_LOCATION");
    }
    promise.resolve(granted ? "granted" : "denied");
    return true;
  }

  @ReactMethod
  public void openPermissionSettings(String permission, Promise promise) {
    try {
      if ("notifications".equals(permission)) {
        openNotificationSettings();
      } else {
        Context context = getReactApplicationContext();
        Intent intent =
            new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", context.getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
      }
      promise.resolve(null);
    } catch (Exception error) {
      promise.reject("permission_settings_failed", "打开权限设置失败：" + error.getMessage());
    }
  }

  private void openNotificationSettings() {
    Context context = getReactApplicationContext();
    Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
    intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    context.startActivity(intent);
  }

  private String notificationState() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (granted(Manifest.permission.POST_NOTIFICATIONS)) {
        return "granted";
      }
      return wasRequested("notifications") ? "denied" : "notDetermined";
    }
    NotificationManager manager =
        (NotificationManager) getReactApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
    boolean enabled = manager != null && manager.areNotificationsEnabled();
    if (enabled) {
      return "granted";
    }
    return wasRequested("notifications") ? "denied" : "notDetermined";
  }

  /** The Android permissions behind one JS permission id. */
  private String[] permissionNames(String permission) {
    switch (permission) {
      case "camera":
        return new String[] {Manifest.permission.CAMERA};
      case "microphone":
        return new String[] {Manifest.permission.RECORD_AUDIO};
      case "location":
        return new String[] {
          Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION
        };
      case "calendar":
        return new String[] {Manifest.permission.READ_CALENDAR};
      case "contacts":
        return new String[] {Manifest.permission.READ_CONTACTS};
      case "photo_library":
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            ? new String[] {Manifest.permission.READ_MEDIA_IMAGES}
            : new String[] {Manifest.permission.READ_EXTERNAL_STORAGE};
      case "bluetooth":
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          return new String[] {
            Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT
          };
        }
        return new String[] {Manifest.permission.BLUETOOTH};
      case "wifi_scan":
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          return new String[] {
            Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.NEARBY_WIFI_DEVICES
          };
        }
        return new String[] {Manifest.permission.ACCESS_FINE_LOCATION};
      case "photo_write":
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? new String[0]
            : new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE};
      default:
        throw new IllegalArgumentException("未知或不可申请的权限：" + permission);
    }
  }

  private boolean isGranted(String id, String[] names) {
    if (names.length == 0) {
      return true;
    }
    if ("location".equals(id) || "wifi_scan".equals(id)) {
      return granted(Manifest.permission.ACCESS_FINE_LOCATION)
          || granted(Manifest.permission.ACCESS_COARSE_LOCATION);
    }
    for (String name : names) {
      if (!granted(name)) {
        return false;
      }
    }
    return true;
  }

  private boolean granted(String permission) {
    return getReactApplicationContext().checkSelfPermission(permission)
        == PackageManager.PERMISSION_GRANTED;
  }

  @Nullable
  private PermissionAwareActivity permissionActivity() {
    Activity activity = getCurrentActivity();
    return activity instanceof PermissionAwareActivity ? (PermissionAwareActivity) activity : null;
  }

  private SharedPreferences store() {
    return getReactApplicationContext()
        .getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE);
  }

  private boolean wasRequested(String permission) {
    return store().getBoolean(REQUESTED_PREFIX + permission, false);
  }

  private void markRequested(String permission) {
    store().edit().putBoolean(REQUESTED_PREFIX + permission, true).apply();
  }
}

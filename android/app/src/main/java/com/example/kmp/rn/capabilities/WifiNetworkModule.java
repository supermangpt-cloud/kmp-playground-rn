package com.example.kmp.rn.capabilities;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The Android Wi-Fi card: a scan-cache read with the two switches that explain
 * an empty list, plus a connection that always goes through the platform's own
 * user-approved path.
 *
 * Connecting uses `WifiNetworkSpecifier` on Android 10+ — the system shows its
 * "connect to this network" dialog and the app never sees the password again.
 * The legacy `WifiManager` path is only used on Android 9 and below. This is
 * the Android counterpart of the HarmonyOS candidate-network route: neither
 * needs the system-only management permission.
 *
 * The payloads mirror `WifiNetworkTurboModule.ets` and are validated by
 * `src/native/wifiNetwork.ts`.
 */
public class WifiNetworkModule extends ReactContextBaseJavaModule {

  private static final long CONNECT_TIMEOUT_MS = 35000;

  private final Handler handler = new Handler(Looper.getMainLooper());

  private ConnectivityManager.NetworkCallback pendingCallback;
  private Promise pendingConnect;

  public WifiNetworkModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "WifiNetwork";
  }

  @ReactMethod
  public void scan(Promise promise) {
    try {
      WifiManager manager = wifiManager();
      boolean active = manager != null && manager.isWifiEnabled();
      boolean locationEnabled = locationEnabled();
      if (!active) {
        WritableMap payload = Arguments.createMap();
        payload.putArray("accessPoints", Arguments.createArray());
        payload.putBoolean("wifiActive", false);
        payload.putBoolean("locationEnabled", locationEnabled);
        payload.putString("reason", "");
        promise.resolve(payload);
        return;
      }
      String reason = "";
      try {
        manager.startScan();
      } catch (Exception error) {
        reason = "刷新扫描失败：" + error.getMessage();
      }
      List<ScanResult> results;
      try {
        results = manager.getScanResults();
      } catch (Exception error) {
        results = new ArrayList<>();
        reason = "读取扫描结果失败：" + error.getMessage();
      }
      WritableMap payload = Arguments.createMap();
      payload.putArray("accessPoints", toAccessPoints(results));
      payload.putBoolean("wifiActive", true);
      payload.putBoolean("locationEnabled", locationEnabled);
      payload.putString("reason", reason);
      promise.resolve(payload);
    } catch (Exception error) {
      promise.reject("wifi_scan_failed", "WiFi 扫描失败：" + error.getMessage());
    }
  }

  /** Keeps the strongest advertisement per SSID, like the card's one-row-per-AP list. */
  private WritableArray toAccessPoints(List<ScanResult> results) {
    Map<String, ScanResult> strongest = new LinkedHashMap<>();
    for (ScanResult result : results) {
      String ssid = result.SSID == null ? "" : result.SSID.trim();
      if (ssid.isEmpty() || "<unknown ssid>".equals(ssid)) {
        continue;
      }
      ScanResult previous = strongest.get(ssid);
      if (previous == null || result.level > previous.level) {
        strongest.put(ssid, result);
      }
    }
    WritableArray accessPoints = Arguments.createArray();
    for (ScanResult result : strongest.values()) {
      int securityType = securityType(result);
      WritableMap accessPoint = Arguments.createMap();
      accessPoint.putString("ssid", result.SSID.trim());
      accessPoint.putInt("rssi", result.level);
      accessPoint.putBoolean("secured", securityType != 0);
      accessPoint.putInt("securityType", securityType);
      accessPoint.putString("security", securityLabel(securityType));
      accessPoints.pushMap(accessPoint);
    }
    return accessPoints;
  }

  /**
   * The security type from the scan result's capability string, e.g.
   * "[WPA2-PSK-CCMP][ESS]". Android 13 exposes no numeric security field on
   * ScanResult, so the flags are matched in order of specificity.
   */
  private int securityType(ScanResult result) {
    String capabilities =
        result.capabilities == null ? "" : result.capabilities.toUpperCase(Locale.US);
    if (capabilities.contains("WPA3") || capabilities.contains("SAE")) {
      return 4;
    }
    if (capabilities.contains("OWE")) {
      return 6;
    }
    if (capabilities.contains("EAP") || capabilities.contains("IEEE8021X")) {
      return 5;
    }
    if (capabilities.contains("RSN") || capabilities.contains("WPA2")) {
      return 3;
    }
    if (capabilities.contains("WPA")) {
      return 2;
    }
    if (capabilities.contains("WEP")) {
      return 1;
    }
    return 0;
  }

  private String securityLabel(int securityType) {
    switch (securityType) {
      case 1:
        return "WEP";
      case 2:
        return "WPA";
      case 3:
        return "WPA2";
      case 4:
        return "WPA3";
      case 5:
        return "EAP";
      case 6:
        return "OWE";
      default:
        return "开放";
    }
  }

  @ReactMethod
  public void currentSsid(Promise promise) {
    try {
      WifiManager manager = wifiManager();
      if (manager == null || !manager.isWifiEnabled()) {
        promise.resolve(ssidPayload(true, "", ""));
        return;
      }
      WifiInfo info = manager.getConnectionInfo();
      String ssid = info == null ? null : info.getSSID();
      if (ssid != null && ssid.length() >= 2 && ssid.startsWith("\"") && ssid.endsWith("\"")) {
        ssid = ssid.substring(1, ssid.length() - 1);
      }
      if (ssid == null || ssid.isEmpty() || "<unknown ssid>".equals(ssid)) {
        promise.resolve(
            ssidPayload(false, "", "系统没有提供当前 SSID：请检查定位权限与定位开关"));
        return;
      }
      promise.resolve(ssidPayload(true, ssid, ""));
    } catch (Exception error) {
      promise.resolve(ssidPayload(false, "", "读取当前 SSID 失败：" + error.getMessage()));
    }
  }

  private WritableMap ssidPayload(boolean known, String ssid, String reason) {
    WritableMap payload = Arguments.createMap();
    payload.putBoolean("known", known);
    payload.putString("ssid", ssid);
    payload.putString("reason", reason);
    return payload;
  }

  @ReactMethod
  public void connect(String ssid, String password, int securityType, Promise promise) {
    String name = ssid == null ? "" : ssid.trim();
    if (name.isEmpty()) {
      promise.resolve(connectFailure("没有指定要连接的 SSID"));
      return;
    }
    WifiManager manager = wifiManager();
    if (manager == null || !manager.isWifiEnabled()) {
      promise.resolve(connectFailure("Wi-Fi 未打开：请先在控制中心打开 Wi-Fi"));
      return;
    }
    if (securityType == 5 || securityType == 1) {
      promise.resolve(
          connectFailure(
              "该 AP 的加密类型（" + securityLabel(securityType) + "）暂不支持在应用内连接："
                  + "企业认证需要账号/证书配置，WEP 已被 Android 10+ 的候选网络接口移除。"));
      return;
    }
    if (!hasWifiPermission()) {
      promise.resolve(
          connectFailure("缺少定位/附近设备权限：请先在「动态权限」里允许定位后重试"));
      return;
    }
    if (pendingConnect != null) {
      promise.resolve(connectFailure("上一次连接还没有结束"));
      return;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      connectWithSpecifier(name, password, securityType, promise);
    } else {
      connectLegacy(name, password, securityType, promise);
    }
  }

  private void connectWithSpecifier(
      String ssid, String password, int securityType, Promise promise) {
    try {
      WifiNetworkSpecifier.Builder builder = new WifiNetworkSpecifier.Builder().setSsid(ssid);
      if (securityType == 3 || securityType == 2) {
        builder.setWpa2Passphrase(password);
      } else if (securityType == 4) {
        builder.setWpa3Passphrase(password);
      } else if (securityType == 6) {
        builder.setIsEnhancedOpen(true);
      }
      NetworkRequest request =
          new NetworkRequest.Builder()
              .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
              .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
              .setNetworkSpecifier(builder.build())
              .build();
      ConnectivityManager connectivity =
          (ConnectivityManager)
              getReactApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
      if (connectivity == null) {
        promise.resolve(connectFailure("系统没有提供 ConnectivityManager"));
        return;
      }
      final AtomicBoolean settled = new AtomicBoolean(false);
      final ConnectivityManager.NetworkCallback callback =
          new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
              if (settled.compareAndSet(false, true)) {
                cleanupPending();
                promise.resolve(connectOutcome("connected", ""));
              }
            }

            @Override
            public void onUnavailable() {
              if (settled.compareAndSet(false, true)) {
                cleanupPending();
                // The system dialog was dismissed or the AP could not be
                // matched; the platform does not separate the two here.
                promise.resolve(connectOutcome("userDeclined", ""));
              }
            }
          };
      pendingConnect = promise;
      pendingCallback = callback;
      connectivity.registerNetworkCallback(request, callback);
      handler.postDelayed(
          () -> {
            if (settled.compareAndSet(false, true)) {
              cleanupPending();
              promise.resolve(
                  connectFailure(
                      "系统已接受候选网络，但 35 秒内没有连上 " + ssid + "（密码错误、AP 不在范围内或系统限制）"));
            }
          },
          CONNECT_TIMEOUT_MS);
    } catch (Exception error) {
      cleanupPending();
      promise.resolve(connectFailure("发起连接失败：" + error.getMessage()));
    }
  }

  @SuppressWarnings("deprecation")
  private void connectLegacy(
      String ssid, String password, int securityType, Promise promise) {
    try {
      WifiManager manager = wifiManager();
      if (manager == null) {
        promise.resolve(connectFailure("系统没有提供 WifiManager"));
        return;
      }
      WifiConfiguration configuration = new WifiConfiguration();
      configuration.SSID = "\"" + ssid + "\"";
      if (securityType == 0) {
        configuration.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
      } else {
        configuration.preSharedKey = "\"" + password + "\"";
      }
      int networkId = manager.addNetwork(configuration);
      if (networkId < 0) {
        promise.resolve(connectFailure("添加网络配置失败：系统拒绝了该配置"));
        return;
      }
      manager.disconnect();
      boolean enabled = manager.enableNetwork(networkId, true);
      manager.reconnect();
      if (!enabled) {
        promise.resolve(connectFailure("系统没有接受该网络配置"));
        return;
      }
      pollLegacyConnection(manager, ssid, SystemClock.elapsedRealtime(), promise);
    } catch (Exception error) {
      promise.resolve(connectFailure("发起连接失败：" + error.getMessage()));
    }
  }

  @SuppressWarnings("deprecation")
  private void pollLegacyConnection(
      WifiManager manager, String ssid, long startedAt, Promise promise) {
    WifiInfo info = manager.getConnectionInfo();
    String current = info == null ? null : info.getSSID();
    if (current != null && current.equals("\"" + ssid + "\"")) {
      promise.resolve(connectOutcome("connected", ""));
      return;
    }
    if (SystemClock.elapsedRealtime() - startedAt > CONNECT_TIMEOUT_MS) {
      promise.resolve(
          connectFailure(
              "系统已接受候选网络，但 35 秒内没有连上 " + ssid + "（密码错误、AP 不在范围内或系统限制）"));
      return;
    }
    handler.postDelayed(() -> pollLegacyConnection(manager, ssid, startedAt, promise), 500);
  }

  private void cleanupPending() {
    ConnectivityManager connectivity =
        (ConnectivityManager)
            getReactApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
    if (connectivity != null && pendingCallback != null) {
      try {
        connectivity.unregisterNetworkCallback(pendingCallback);
      } catch (Exception ignored) {
        // The callback may already have been unregistered by the system.
      }
    }
    pendingCallback = null;
    pendingConnect = null;
  }

  private WritableMap connectOutcome(String outcome, String reason) {
    WritableMap payload = Arguments.createMap();
    payload.putString("outcome", outcome);
    payload.putString("reason", reason);
    return payload;
  }

  private WritableMap connectFailure(String reason) {
    return connectOutcome("failed", reason);
  }

  private boolean hasWifiPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        && getReactApplicationContext().checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES)
            == PackageManager.PERMISSION_GRANTED) {
      return true;
    }
    return getReactApplicationContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        == PackageManager.PERMISSION_GRANTED;
  }

  private boolean locationEnabled() {
    try {
      LocationManager manager =
          (LocationManager) getReactApplicationContext().getSystemService(Context.LOCATION_SERVICE);
      if (manager == null) {
        return false;
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        return manager.isLocationEnabled();
      }
      return manager.isProviderEnabled(LocationManager.GPS_PROVIDER);
    } catch (Exception error) {
      return false;
    }
  }

  private WifiManager wifiManager() {
    return (WifiManager)
        getReactApplicationContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
  }
}

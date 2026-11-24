package com.example.kmp.rn.capabilities;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The Android Bluetooth LE card, against `BluetoothLeScanner` and `BluetoothGatt`
 * directly.
 *
 * This replaces react-native-ble-plx: the app no longer carries a third-party
 * BLE stack, and the same shape is implemented natively on HarmonyOS and iOS.
 *
 * The module keeps the discovered map, so `getDevices` can be polled instead of
 * streaming one bridge event per advertisement (the JS wrapper repaints on a
 * timer anyway, and a busy room produces hundreds of advertisements a second).
 *
 * `connect` resolves on `STATE_CONNECTED` and rejects with the reason otherwise;
 * it never reports success early. Addresses are real MACs here, unlike the
 * HarmonyOS side, which hands out per-app virtual ids without
 * BLUETOOTH_PEERS_MAC.
 */
public class BluetoothLeModule extends ReactContextBaseJavaModule {

  private static final String NAME = "BluetoothLe";
  private static final long CONNECT_TIMEOUT_MS = 15000L;

  private final ReactApplicationContext reactContext;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final Map<String, WritableMap> found = new LinkedHashMap<>();
  private final Map<String, BluetoothGatt> gatts = new LinkedHashMap<>();

  private BluetoothLeScanner scanner;
  private ScanCallback scanCallback;

  public BluetoothLeModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return NAME;
  }

  /** 'on' | 'off' | 'unknown', matching the HarmonyOS module's vocabulary. */
  @ReactMethod(isBlockingSynchronousMethod = true)
  public String getState() {
    BluetoothAdapter adapter = adapter();
    if (adapter == null) {
      return "unknown";
    }
    try {
      return adapter.isEnabled() ? "on" : "off";
    } catch (SecurityException denied) {
      return "unknown";
    }
  }

  @ReactMethod
  public void startScan(final Promise promise) {
    final BluetoothAdapter adapter = adapter();
    if (adapter == null) {
      promise.reject("no_adapter", "这台设备没有蓝牙适配器");
      return;
    }
    if (!adapter.isEnabled()) {
      promise.reject("bluetooth_off", "蓝牙已关闭，请在系统设置中打开蓝牙后重试");
      return;
    }
    if (!hasScanPermission()) {
      promise.reject("permission", "未授予附近设备权限：请允许本 App 扫描附近的设备后重试");
      return;
    }
    main.post(() -> {
      try {
        if (scanCallback != null) {
          promise.resolve(null);
          return;
        }
        found.clear();
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
          promise.reject("no_scanner", "蓝牙扫描器不可用");
          return;
        }
        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();
        scanCallback = new ScanCallback() {
          @Override
          public void onScanResult(int callbackType, ScanResult result) {
            record(result);
          }

          @Override
          public void onBatchScanResults(java.util.List<ScanResult> results) {
            for (ScanResult result : results) {
              record(result);
            }
          }

          @Override
          public void onScanFailed(int errorCode) {
            // The JS caller already resolved; the next poll simply stops growing.
          }
        };
        scanner.startScan(null, settings, scanCallback);
        promise.resolve(null);
      } catch (SecurityException denied) {
        promise.reject("permission", "未授予附近设备权限：请允许本 App 扫描附近的设备后重试");
      } catch (RuntimeException failed) {
        promise.reject("scan_failed", "无法开始扫描：" + failed.getMessage());
      }
    });
  }

  @ReactMethod
  public void stopScan() {
    final ScanCallback callback = scanCallback;
    final BluetoothLeScanner activeScanner = scanner;
    scanCallback = null;
    scanner = null;
    if (callback == null || activeScanner == null) {
      return;
    }
    main.post(() -> {
      try {
        activeScanner.stopScan(callback);
      } catch (SecurityException | IllegalStateException ignored) {
        // Bluetooth was switched off under us; nothing left to stop.
      }
    });
  }

  /** The devices seen since `startScan`, strongest signal first. */
  @ReactMethod(isBlockingSynchronousMethod = true)
  public WritableArray getDevices() {
    WritableArray list = Arguments.createArray();
    for (WritableMap device : sortByRssi()) {
      list.pushMap(device);
    }
    return list;
  }

  @ReactMethod
  public void connect(final String deviceId, final Promise promise) {
    final BluetoothAdapter adapter = adapter();
    if (adapter == null) {
      promise.reject("no_adapter", "这台设备没有蓝牙适配器");
      return;
    }
    if (!adapter.isEnabled()) {
      promise.reject("bluetooth_off", "蓝牙已关闭，请在系统设置中打开蓝牙后重试");
      return;
    }
    if (!hasConnectPermission()) {
      promise.reject("permission", "未授予附近设备权限：请允许本 App 连接附近的设备后重试");
      return;
    }
    if (gatts.containsKey(deviceId)) {
      promise.resolve(null);
      return;
    }
    main.post(() -> {
      final BluetoothDevice device;
      try {
        device = adapter.getRemoteDevice(deviceId);
      } catch (IllegalArgumentException malformed) {
        promise.reject("bad_address", "地址无法解析：" + deviceId);
        return;
      }
      final boolean[] settled = {false};
      final Runnable timeout = () -> {
        if (settled[0]) {
          return;
        }
        settled[0] = true;
        BluetoothGatt pending = gatts.remove(deviceId);
        if (pending != null) {
          pending.close();
        }
        promise.reject("timeout", "连接超时（15 秒内没有连上）");
      };
      final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
          if (settled[0]) {
            return;
          }
          if (newState == BluetoothProfile.STATE_CONNECTED) {
            settled[0] = true;
            main.removeCallbacks(timeout);
            gatts.put(deviceId, gatt);
            promise.resolve(null);
            return;
          }
          if (newState == BluetoothProfile.STATE_DISCONNECTED) {
            settled[0] = true;
            main.removeCallbacks(timeout);
            gatts.remove(deviceId);
            gatt.close();
            promise.reject("disconnected", "连接失败：设备在连接完成前断开");
          }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
          // Discovery is not needed for the demo link.
        }

        @Override
        public void onCharacteristicRead(
            BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
          // No reads in this flow.
        }
      };
      try {
        BluetoothGatt gatt = device.connectGatt(reactContext, false, callback,
            BluetoothDevice.TRANSPORT_LE);
        if (gatt == null) {
          settled[0] = true;
          promise.reject("connect_failed", "无法发起连接");
          return;
        }
        main.postDelayed(timeout, CONNECT_TIMEOUT_MS);
      } catch (SecurityException denied) {
        settled[0] = true;
        promise.reject("permission", "未授予附近设备权限：请允许本 App 连接附近的设备后重试");
      } catch (RuntimeException failed) {
        settled[0] = true;
        promise.reject("connect_failed", "连接失败：" + failed.getMessage());
      }
    });
  }

  @ReactMethod
  public void disconnect(String deviceId) {
    final BluetoothGatt gatt = gatts.remove(deviceId);
    if (gatt == null) {
      return;
    }
    main.post(() -> {
      try {
        gatt.disconnect();
      } catch (SecurityException ignored) {
        // Permission revoked mid-session; close() below still releases the link.
      } finally {
        gatt.close();
      }
    });
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public boolean isConnected(String deviceId) {
    return gatts.containsKey(deviceId);
  }

  private BluetoothAdapter adapter() {
    BluetoothManager manager =
        (BluetoothManager) reactContext.getSystemService(Context.BLUETOOTH_SERVICE);
    return manager == null ? null : manager.getAdapter();
  }

  private boolean hasScanPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return granted(Manifest.permission.BLUETOOTH_SCAN);
    }
    return granted(Manifest.permission.ACCESS_FINE_LOCATION);
  }

  private boolean hasConnectPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return granted(Manifest.permission.BLUETOOTH_CONNECT);
    }
    return granted(Manifest.permission.BLUETOOTH);
  }

  private boolean granted(String permission) {
    return ContextCompat.checkSelfPermission(reactContext, permission)
        == PackageManager.PERMISSION_GRANTED;
  }

  @SuppressLint("MissingPermission")
  private void record(ScanResult result) {
    BluetoothDevice device = result.getDevice();
    if (device == null) {
      return;
    }
    String id;
    String name;
    try {
      id = device.getAddress();
      name = device.getName();
    } catch (SecurityException denied) {
      return;
    }
    if (id == null) {
      return;
    }
    WritableMap previous = found.get(id);
    if (previous != null && previous.getInt("rssi") >= result.getRssi()) {
      return;
    }
    WritableMap record = Arguments.createMap();
    record.putString("id", id);
    record.putString("name", name == null ? "" : name);
    record.putInt("rssi", result.getRssi());
    found.put(id, record);
  }

  private java.util.List<WritableMap> sortByRssi() {
    java.util.List<WritableMap> list = new java.util.ArrayList<>(found.values());
    java.util.Collections.sort(list, (a, b) ->
        Integer.compare(b.getInt("rssi"), a.getInt("rssi")));
    return list;
  }
}

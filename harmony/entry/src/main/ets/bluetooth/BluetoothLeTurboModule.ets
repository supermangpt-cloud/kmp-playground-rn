/**
 * Bluetooth LE behind the capability page's row, written against
 * `@ohos.bluetooth.ble` directly.
 *
 * The JS side keeps the discovered list itself: `startScan` only opens the
 * platform scan, `getDevices` returns what has been seen so far (id, name,
 * RSSI), and `stopScan` closes it. Polling beats a bridge callback here because
 * the JS wrapper already repaints on a timer, and a bridge callback would have
 * to marshal an event across the turbo-module boundary for every advertisement.
 *
 * The platform properties that the page states are real:
 * - the address is the per-app virtual id unless the app holds
 *   GET_BLUETOOTH_PEERS_MAC, so it is not a MAC;
 * - many nearby advertisements are privacy random addresses that cannot be
 *   connected, and connecting to one ends in a timeout;
 * - `ACCESS_BLUETOOTH` is user_grant, so the first scan asks for it.
 */
import { ble, access, constant } from '@kit.ConnectivityKit';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';

const DOMAIN = 0x0000;
const TAG = 'BluetoothLe';
const BLUETOOTH_PERMISSION: Permissions = 'ohos.permission.ACCESS_BLUETOOTH';
const CONNECT_TIMEOUT_MILLIS = 15000;

/** One discovered device, as handed to JS. */
export interface BleDeviceRecord {
  id: string;
  name: string;
  rssi: number;
}

/** `ble.startBLEScan` needs a non-null filter list; one empty filter matches all. */
function allDevicesFilter(): Array<ble.ScanFilter> {
  const filter: ble.ScanFilter = {};
  const filters: Array<ble.ScanFilter> = [];
  filters.push(filter);
  return filters;
}

export class BluetoothLeTurboModule extends TurboModule {
  private context: common.UIAbilityContext;
  private found: Map<string, BleDeviceRecord> = new Map();
  private scanning: boolean = false;
  private listener: ((results: Array<ble.ScanResult>) => void) | null = null;
  private clients: Map<string, ble.GattClientDevice> = new Map();

  constructor(ctx: TurboModuleContext) {
    super(ctx);
    this.context = ctx.uiAbilityContext;
  }

  /** 'on' | 'off' | 'unauthorized' | 'unsupported' */
  getState(): string {
    try {
      const state = access.getState();
      if (state === access.BluetoothState.STATE_ON) {
        return 'on';
      }
      if (state === access.BluetoothState.STATE_OFF) {
        return 'off';
      }
      return 'unknown';
    } catch (error) {
      hilog.warn(DOMAIN, TAG, 'getState failed: %{public}s', `${(error as BusinessError).message}`);
      return 'unknown';
    }
  }

  async startScan(): Promise<void> {
    await this.ensurePermission();
    this.ensureOn();
    if (this.scanning) {
      return;
    }
    this.found.clear();
    const listener = (results: Array<ble.ScanResult>): void => {
      for (const result of results) {
        const previous = this.found.get(result.deviceId);
        if (previous !== undefined && previous.rssi >= result.rssi) {
          continue;
        }
        const record: BleDeviceRecord = {
          id: result.deviceId,
          name: sanitize(result.deviceName ?? ''),
          rssi: result.rssi,
        };
        this.found.set(result.deviceId, record);
      }
    };
    this.listener = listener;
    ble.on('BLEDeviceFind', listener);
    try {
      const options: ble.ScanOptions = {
        dutyMode: ble.ScanDuty.SCAN_MODE_LOW_POWER,
      };
      ble.startBLEScan(allDevicesFilter(), options);
      this.scanning = true;
    } catch (error) {
      this.releaseScan(listener);
      throw new Error(`无法开始扫描：${(error as BusinessError).message}`);
    }
  }

  stopScan(): void {
    const listener = this.listener;
    this.listener = null;
    this.scanning = false;
    this.releaseScan(listener);
  }

  /** The devices seen since `startScan`, newest RSSI first. */
  getDevices(): Array<BleDeviceRecord> {
    const records: Array<BleDeviceRecord> = Array.from(this.found.values());
    records.sort((a, b) => b.rssi - a.rssi);
    return records;
  }

  /** Resolves once the platform reports STATE_CONNECTED, or rejects with the reason. */
  async connect(deviceId: string): Promise<void> {
    await this.ensurePermission();
    this.ensureOn();
    if (this.clients.has(deviceId)) {
      return;
    }
    const client = ble.createGattClientDevice(deviceId);
    await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
      let settled = false;
      let timer = -1;
      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        try {
          client.off('BLEConnectionStateChange', onChange);
        } catch (ignored) {
          // already gone
        }
        if (error !== undefined) {
          reject(error);
        } else {
          resolve();
        }
      };
      const onChange = (state: ble.BLEConnectionChangeState): void => {
        if (state.state === constant.ProfileConnectionState.STATE_CONNECTED) {
          finish();
        } else if (state.state === constant.ProfileConnectionState.STATE_DISCONNECTED) {
          finish(new Error('连接失败：设备在连接完成前断开'));
        }
      };
      timer = setTimeout(() => {
        finish(new Error('连接超时（15 秒内没有连上）'));
      }, CONNECT_TIMEOUT_MILLIS);
      client.on('BLEConnectionStateChange', onChange);
      try {
        client.connect();
      } catch (error) {
        finish(new Error(`连接失败：${(error as BusinessError).message}`));
      }
    });
    this.clients.set(deviceId, client);
  }

  disconnect(deviceId: string): void {
    const client = this.clients.get(deviceId);
    this.clients.delete(deviceId);
    if (client === undefined) {
      return;
    }
    try {
      client.disconnect();
    } catch (error) {
      hilog.warn(DOMAIN, TAG, 'disconnect failed: %{public}s', `${(error as BusinessError).message}`);
    }
    try {
      client.close();
    } catch (error) {
      hilog.warn(DOMAIN, TAG, 'close failed: %{public}s', `${(error as BusinessError).message}`);
    }
  }

  isConnected(deviceId: string): boolean {
    return this.clients.has(deviceId);
  }

  private releaseScan(listener: ((results: Array<ble.ScanResult>) => void) | null): void {
    if (listener === null) {
      return;
    }
    try {
      ble.stopBLEScan();
    } catch (error) {
      hilog.warn(DOMAIN, TAG, 'stopBLEScan failed: %{public}s', `${(error as BusinessError).message}`);
    }
    try {
      ble.off('BLEDeviceFind', listener);
    } catch (error) {
      hilog.warn(DOMAIN, TAG, 'off BLEDeviceFind failed: %{public}s', `${(error as BusinessError).message}`);
    }
  }

  private async ensurePermission(): Promise<void> {
    if (this.granted()) {
      return;
    }
    const manager = abilityAccessCtrl.createAtManager();
    const result = await manager.requestPermissionsFromUser(this.context, [BLUETOOTH_PERMISSION]);
    if (result.authResults.length === 0 || result.authResults[0] !== 0) {
      throw new Error('未授予蓝牙权限：请在系统设置中允许本 App 使用蓝牙后重试');
    }
  }

  private granted(): boolean {
    const manager = abilityAccessCtrl.createAtManager();
    const token = this.context.applicationInfo.accessTokenId;
    return manager.checkAccessTokenSync(token, BLUETOOTH_PERMISSION) ===
      abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
  }

  private ensureOn(): void {
    if (access.getState() !== access.BluetoothState.STATE_ON) {
      throw new Error('蓝牙已关闭，请在系统设置中打开蓝牙后重试');
    }
  }
}

/** Keep the separator characters out of names; the list is JSON, but be safe. */
function sanitize(value: string): string {
  return value.replace(/[\n\u0001]/g, ' ');
}

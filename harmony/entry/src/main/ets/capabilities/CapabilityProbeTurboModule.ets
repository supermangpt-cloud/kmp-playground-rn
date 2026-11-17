import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { abilityAccessCtrl, bundleManager, common, Permissions } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { Environment, fileIo as fs } from '@kit.CoreFileKit';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { connection } from '@kit.NetworkKit';
import { notificationManager } from '@kit.NotificationKit';
import { systemShare } from '@kit.ShareKit';
import { vibrator } from '@kit.SensorServiceKit';

/** One row of the 存储目录 card, as this app reads it on HarmonyOS. */
export interface DirectoryPayload {
  kind: string;
  /** Absolute path, or '' when this platform has no directory for the row. */
  path: string;
  /** A real fs.accessSync probe made during this read. */
  exists: boolean;
  /** Why the path is empty, or a runtime caveat; '' when there is none. */
  note: string;
}

/** The two public-directory permissions are user_grant on this build. */
const DOWNLOAD_DIRECTORY: Permissions =
  'ohos.permission.READ_WRITE_DOWNLOAD_DIRECTORY';
const DOCUMENTS_DIRECTORY: Permissions =
  'ohos.permission.READ_WRITE_DOCUMENTS_DIRECTORY';

/** One reading of the current network: the connected flag and its transport. */
export interface NetworkStatusPayload {
  connected: boolean;
  type: string;
}

/** The five fields the capability page's 设备信息 row prints. */
export interface DeviceInfoPayload {
  model: string;
  systemName: string;
  systemVersion: string;
  appName: string;
  appVersion: string;
}

/**
 * The result of one haptic tap.
 *
 * `note` is non-empty only when the request could not be delivered through the
 * normal path and had to fall back, which the row prints so a disabled system
 * switch is never mistaken for a broken button.
 */
export interface HapticPayload {
  fired: boolean;
  note: string;
}

/** The user_grant permissions behind the four real permission rows. */
const CAMERA_PERMISSION: Permissions = 'ohos.permission.CAMERA';
const MICROPHONE_PERMISSION: Permissions = 'ohos.permission.MICROPHONE';
const LOCATION_PERMISSION: Permissions = 'ohos.permission.LOCATION';
const APPROXIMATELY_LOCATION_PERMISSION: Permissions =
  'ohos.permission.APPROXIMATELY_LOCATION';
const READ_CALENDAR_PERMISSION: Permissions = 'ohos.permission.READ_CALENDAR';
const ACCESS_BLUETOOTH_PERMISSION: Permissions =
  'ohos.permission.ACCESS_BLUETOOTH';

/**
 * WRITE_IMAGEVIDEO is not a row of the eight-permission card (that card's 相册
 * row is about reading the album). The save flow uses this id only for its
 * 去设置 path: after a refusal the platform will not show the dialog again, so
 * the QR page and the 保存图片到相册 row open this permission's settings page.
 */
const WRITE_IMAGE_VIDEO_PERMISSION: Permissions =
  'ohos.permission.WRITE_IMAGEVIDEO';

/** Preference store that remembers which permissions were already asked for. */
const PERMISSION_STORE_NAME = 'platform_capabilities';
const REQUESTED_KEY_PREFIX = 'permission_requested_';

/**
 * The app's own ArkTS side of the platform-capability page.
 *
 * The capabilities this module backs (device information, network status, the
 * storage directories, haptics, system share and the dynamic permissions) all
 * need `@ohos.*` APIs that no React Native JS module can reach on this device,
 * so the calls live here and the JS side only formats what came back. The
 * implementations follow the KMP build's already-verified ArkTS capabilities
 * (`harmonyApp/entry/src/main/ets/capabilities`), which is why the directory
 * notes, the haptics fallback and the permission semantics match it.
 *
 * Every method is asynchronous from JS's point of view: the C++ side registers
 * them with `ARK_ASYNC_METHOD_METADATA`, so returning a resolved promise is the
 * contract.
 */
export class CapabilityProbeTurboModule extends TurboModule {
  private context: common.UIAbilityContext;
  /** Lazily opened store for the "we already asked" flags. */
  private permissionStore: preferences.Preferences | null = null;

  constructor(ctx: TurboModuleContext) {
    super(ctx);
    this.context = ctx.uiAbilityContext;
  }

  /**
   * The real device and app identity: `@ohos.deviceInfo` for the hardware and
   * `bundleManager` for this app. `displayVersion` is
   * "ALN-AL00 7.0.0.111(SP10C00E111R4P3)" — the model is already a field of its
   * own, so its prefix is stripped and the version kept.
   */
  readDeviceInfo(): Promise<DeviceInfoPayload> {
    const bundleInfo = bundleManager.getBundleInfoForSelfSync(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT,
    );
    const model = deviceInfo.productModel;
    const display = deviceInfo.displayVersion;
    const prefix = `${model} `;
    const systemVersion = display.startsWith(prefix)
      ? display.substring(prefix.length)
      : display;
    const payload: DeviceInfoPayload = {
      model: model,
      systemName: 'HarmonyOS',
      systemVersion: systemVersion,
      appName: this.appName(),
      appVersion: bundleInfo.versionName,
    };
    return Promise.resolve(payload);
  }

  /**
   * The current network state, read from scratch on every call:
   * `getDefaultNetSync` and the default network's bearer types. Wi-Fi is
   * checked first, then cellular, then ethernet — the same precedence the KMP
   * build uses when a network reports more than one transport.
   *
   * There is no cached value here on purpose: switching Wi-Fi off and calling
   * again must return `none`, which the capability page's acceptance check
   * exercises.
   */
  readNetworkStatus(): Promise<NetworkStatusPayload> {
    const handle = connection.getDefaultNetSync();
    if (!handle || handle.netId === 0) {
      const none: NetworkStatusPayload = { connected: false, type: 'none' };
      return Promise.resolve(none);
    }
    const capabilities = connection.getNetCapabilitiesSync(handle);
    const bearers = capabilities.bearerTypes;
    // A default network exists, so "connected" is true; a transport none of
    // the three known bearer types describes is reported as `unknown` rather
    // than guessed into one of them.
    let type: string = 'unknown';
    if (bearers.includes(connection.NetBearType.BEARER_WIFI)) {
      type = 'wifi';
    } else if (bearers.includes(connection.NetBearType.BEARER_CELLULAR)) {
      type = 'cellular';
    } else if (bearers.includes(connection.NetBearType.BEARER_ETHERNET)) {
      type = 'ethernet';
    }
    const payload: NetworkStatusPayload = {
      connected: true,
      type: type,
    };
    return Promise.resolve(payload);
  }

  /**
   * The seven directories of the KMP build's HarmonyOS card, in its order:
   * four private Context paths, the two public Download/Document directories
   * and the album (which has no directory path).
   *
   * `requestPermissions` is true only for the card's explicit 刷新 press: merely
   * opening the page must not show a permission dialog, so the first read only
   * explains a refusal. Both public directory APIs are also limited by device
   * type and answer 801 on phones; that becomes the row's note, never a made-up
   * path.
   *
   * `exists` is a real `fs.accessSync` probe at read time, not a constant.
   */
  async readDirectories(
    requestPermissions: boolean,
  ): Promise<DirectoryPayload[]> {
    let permissionFailure = '';
    if (requestPermissions) {
      permissionFailure = await this.requestPublicDirectoryPermissions();
    }
    const records: DirectoryPayload[] = [
      this.record('Cache', this.context.cacheDir, ''),
      this.record('Files', this.context.filesDir, ''),
      this.record('Database', this.context.databaseDir, ''),
      this.record('Temp', this.context.tempDir, ''),
      this.publicDirectory(
        'Downloads',
        permissionFailure,
        '下载目录',
        (): string => Environment.getUserDownloadDir(),
      ),
      this.publicDirectory(
        'Documents',
        permissionFailure,
        '文档目录',
        (): string => Environment.getUserDocumentDir(),
      ),
      // The album is a media library behind photoAccessHelper's URI API, not a
      // directory; the JS side adds that explanation for this empty path.
      this.record('PhotoAlbum', '', ''),
    ];
    return records;
  }

  /** One record; a path that is really on disk is `exists: true`. */
  private record(kind: string, path: string, note: string): DirectoryPayload {
    let exists = false;
    if (path.length > 0) {
      try {
        exists = fs.accessSync(path);
      } catch (error) {
        exists = false;
      }
    }
    const payload: DirectoryPayload = {
      kind: kind,
      path: path,
      exists: exists,
      note: note.split('\n').join(' '),
    };
    return payload;
  }

  /**
   * One public directory, with the platform's own reason when reading it fails:
   * 201 is the permission, 801 is a device type that does not have this API.
   */
  private publicDirectory(
    kind: string,
    permissionFailure: string,
    label: string,
    read: () => string,
  ): DirectoryPayload {
    try {
      return this.record(kind, read(), '');
    } catch (error) {
      const failure = error as BusinessError;
      const code = failure.code;
      const message = failure.message ?? `${error}`;
      if (code === 201) {
        const suffix =
          permissionFailure.length > 0 ? `（${permissionFailure}）` : '';
        return this.record(
          kind,
          '',
          `未授予${label}权限（201）；点「刷新」重新申请${suffix}`,
        );
      }
      if (code === 801) {
        return this.record(
          kind,
          '',
          `当前设备类型不支持公共${label}（801：仅 PC/2in1 与平板支持）`,
        );
      }
      return this.record(kind, '', `读取公共${label}失败：${code} ${message}`);
    }
  }

  /**
   * One haptic tap of `strength` (light / medium / heavy).
   *
   * Two things decide whether a vibration is actually felt, and both are made
   * explicit here instead of being guessed at:
   *
   * 1. **A motor has to exist.** `getVibratorInfoSync()` answers that; without
   *    one, the call rejects with a sentence the row prints, rather than a
   *    silent no-op.
   *
   * 2. **`usage` picks which system switch governs the call.** `physicalFeedback`
   *    is the honest choice for a touch interaction, but it is gated by the
   *    touch-feedback switch. When that switch is off the system drops the call
   *    (logs `ShouldIgnoreVibrate`, error 14600101), so the tap is retried once
   *    as `notification` (gated by the silent switch) and the returned note says
   *    so. If the retry is dropped too, the promise rejects with the platform's
   *    code so the row can explain why nothing was felt.
   */
  async vibrateHaptic(strength: string): Promise<HapticPayload> {
    const effect = this.vibrationEffect(strength);
    this.requireVibrator();
    try {
      await vibrator.startVibration(effect, {
        id: 0,
        usage: 'physicalFeedback',
      });
      return { fired: true, note: '' };
    } catch (error) {
      const physical = error as BusinessError;
      try {
        await vibrator.startVibration(effect, {
          id: 0,
          usage: 'notification',
        });
        return {
          fired: true,
          note: '物理反馈被系统触感开关忽略，已用通知场景振动代替',
        };
      } catch (fallbackError) {
        const fallback = fallbackError as BusinessError;
        throw new Error(
          `震动被系统忽略（触感开关或静音开关关闭？）：` +
            `physicalFeedback ${physical.code} ${physical.message}；` +
            `notification ${fallback.code} ${fallback.message}`,
        );
      }
    }
  }

  /**
   * Opens the system share panel with `text` (ShareKit's `SystemShare`).
   *
   * The promise resolves once the panel was presented; it does not wait for the
   * user to pick a target, because HarmonyOS does not report that back — the
   * same meaning the KMP build gives its `Ok`.
   */
  async shareText(text: string): Promise<void> {
    if (!canIUse('SystemCapability.Collaboration.SystemShare')) {
      throw new Error(
        '当前设备不支持系统分享（SystemCapability.Collaboration.SystemShare 不可用）',
      );
    }
    const data = new systemShare.SharedData({
      utd: 'general.plain-text',
      content: text,
      title: text,
    });
    const controller = new systemShare.ShareController(data);
    await controller.show(this.context, {
      previewMode: systemShare.SharePreviewMode.DETAIL,
      selectionMode: systemShare.SelectionMode.SINGLE,
    });
  }

  /**
   * Reads one permission without showing a dialog.
   *
   * HarmonyOS answers `checkAccessTokenSync` (granted / not) but has no
   * "never asked" state. This class records every request in the app's
   * preferences before the dialog opens, so the answer here can distinguish
   * `notDetermined` (never asked) from `denied` (asked, refused).
   * Notifications are not a permission here: they use the notification manager.
   */
  async readPermissionState(permission: string): Promise<string> {
    if (permission === 'notifications') {
      return this.notificationState();
    }
    const names = this.permissionNames(permission);
    if (this.isGranted(permission, names)) {
      return 'granted';
    }
    return this.store().getSync(this.requestedKey(permission), '') === '1'
      ? 'denied'
      : 'notDetermined';
  }

  /**
   * Shows the system dialog for `permission` and returns the resulting state.
   *
   * `authResults` is 0 for granted and -1 for denied; any other code means the
   * request itself was invalid (for example the permission is missing from
   * `module.json5`), which rejects with the code instead of pretending the user
   * said no.
   */
  async requestPermission(permission: string): Promise<string> {
    if (permission === 'notifications') {
      return this.requestNotification();
    }
    const names = this.permissionNames(permission);
    const store = this.store();
    // Recorded before the dialog opens: after a denial HarmonyOS cannot tell
    // "not asked" from "denied" on its own.
    store.putSync(this.requestedKey(permission), '1');
    await store.flush();
    const manager = abilityAccessCtrl.createAtManager();
    try {
      const result = await manager.requestPermissionsFromUser(
        this.context,
        names,
      );
      return this.answer(permission, result.authResults);
    } catch (error) {
      const failure = error as BusinessError;
      throw new Error(`申请权限失败：${failure.code} ${failure.message}`);
    }
  }

  /**
   * Opens the system page where `permission` can be changed.
   *
   * After a denial HarmonyOS does not show its first-run dialog again, so this
   * is the documented second step: `requestPermissionOnSetting` opens the
   * permission settings dialog for a normal permission, and notifications use
   * the notification settings page.
   */
  async openPermissionSettings(permission: string): Promise<void> {
    if (permission === 'notifications') {
      await notificationManager.openNotificationSettings(this.context);
      return;
    }
    const names = this.permissionNames(permission);
    const manager = abilityAccessCtrl.createAtManager();
    try {
      await manager.requestPermissionOnSetting(this.context, names);
    } catch (error) {
      const failure = error as BusinessError;
      throw new Error(`打开权限设置失败：${failure.code} ${failure.message}`);
    }
  }

  /** The time effect behind one strength; an unknown strength is a caller bug. */
  private vibrationEffect(strength: string): vibrator.VibrateTime {
    switch (strength) {
      case 'light':
        return { type: 'time', duration: 15 };
      case 'medium':
        return { type: 'time', duration: 40 };
      case 'heavy':
        return { type: 'time', duration: 80 };
      default:
        throw new Error(`未知的震动档位：${strength}`);
    }
  }

  /**
   * Rejects when the device reports no motor. `getVibratorInfoSync` is API 19+;
   * 202 / 801 means the query is not available on this build, so a motor is
   * assumed rather than hiding the capability on an older device.
   */
  private requireVibrator(): void {
    try {
      const motors = vibrator.getVibratorInfoSync();
      if (motors.length === 0) {
        throw new Error('该设备没有振动马达，无法触发震动');
      }
    } catch (error) {
      const failure = error as BusinessError;
      if (failure.code === 202 || failure.code === 801) {
        return;
      }
      if (error instanceof Error && failure.code === undefined) {
        throw error;
      }
      throw new Error(
        `无法确认振动马达：${failure.code} ${failure.message ?? `${error}`}`,
      );
    }
  }

  /** `granted` / `denied` / `notDetermined`, with notifications handled apart. */
  private notificationState(): string {
    if (notificationManager.isNotificationEnabledSync()) {
      return 'granted';
    }
    return this.store().getSync(
      this.requestedKey('notifications'),
      '',
    ) === '1'
      ? 'denied'
      : 'notDetermined';
  }

  /** Asks for notification enablement; the switch's real state is the answer. */
  private async requestNotification(): Promise<string> {
    const store = this.store();
    store.putSync(this.requestedKey('notifications'), '1');
    await store.flush();
    try {
      await notificationManager.requestEnableNotification(this.context);
    } catch (error) {
      // 1600004 means the system did not show its dialog; the switch below is
      // the honest answer either way.
      const failure = error as BusinessError;
      console.info(
        `requestEnableNotification: ${failure.code} ${failure.message}`,
      );
    }
    return notificationManager.isNotificationEnabledSync()
      ? 'granted'
      : 'denied';
  }

  /** The OS permissions one row needs; location needs both accuracy levels. */
  private permissionNames(permission: string): Permissions[] {
    switch (permission) {
      case 'camera':
        return [CAMERA_PERMISSION];
      case 'microphone':
        return [MICROPHONE_PERMISSION];
      case 'location':
        return [LOCATION_PERMISSION, APPROXIMATELY_LOCATION_PERMISSION];
      case 'calendar':
        return [READ_CALENDAR_PERMISSION];
      case 'bluetooth':
        return [ACCESS_BLUETOOTH_PERMISSION];
      case 'wifi_scan':
        // The WiFi card asks only for approximate location before a scan; the
        // precise LOCATION permission of the 动态权限 row is not needed by
        // @ohos.wifiManager's scan/list path.
        return [APPROXIMATELY_LOCATION_PERMISSION];
      case 'photo_write':
        // Only 去设置 reaches this id; the save itself requests the permission
        // in the app's ImageSave module, next to createAsset.
        return [WRITE_IMAGE_VIDEO_PERMISSION];
      default:
        throw new Error(`未知或不可申请的权限：${permission}`);
    }
  }

  /**
   * Location is usable when either accuracy level is granted (the user may pick
   * approximate); every other row needs all of its permissions.
   */
  private isGranted(permission: string, names: Permissions[]): boolean {
    const manager = abilityAccessCtrl.createAtManager();
    const tokenId = this.context.applicationInfo.accessTokenId;
    const check = (name: Permissions): boolean =>
      manager.checkAccessTokenSync(tokenId, name) ===
      abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
    return permission === 'location' ? names.some(check) : names.every(check);
  }

  /** Turns `authResults` into one state, rejecting an invalid request code. */
  private answer(permission: string, results: number[]): string {
    if (results.length === 0) {
      throw new Error('权限申请没有返回结果');
    }
    const invalid = results.find(
      (code: number): boolean => code !== 0 && code !== -1,
    );
    if (invalid !== undefined) {
      throw new Error(
        `权限申请返回了 ${invalid}（权限是否已在 module.json5 声明？）`,
      );
    }
    if (permission === 'location') {
      return results.some((code: number): boolean => code === 0)
        ? 'granted'
        : 'denied';
    }
    return results[0] === 0 ? 'granted' : 'denied';
  }

  /** The lazily opened preferences store. */
  private store(): preferences.Preferences {
    if (this.permissionStore === null) {
      this.permissionStore = preferences.getPreferencesSync(this.context, {
        name: PERMISSION_STORE_NAME,
      });
    }
    return this.permissionStore;
  }

  private requestedKey(permission: string): string {
    return `${REQUESTED_KEY_PREFIX}${permission}`;
  }

  /**
   * Asks for the two `user_grant` permissions. Already granted is a no-op on the
   * system side; a refusal or an API the device does not have is returned as a
   * sentence the 201 note can quote, not thrown.
   */
  private async requestPublicDirectoryPermissions(): Promise<string> {
    try {
      const manager = abilityAccessCtrl.createAtManager();
      const result = await manager.requestPermissionsFromUser(this.context, [
        DOWNLOAD_DIRECTORY,
        DOCUMENTS_DIRECTORY,
      ]);
      const denied = result.authResults.some(
        (code: number): boolean => code !== 0,
      );
      return denied ? '权限申请被拒绝' : '';
    } catch (error) {
      const failure = error as BusinessError;
      return `申请权限失败：${failure.message ?? `${error}`}`;
    }
  }

  /**
   * The application label is a resource reference on HarmonyOS
   * ("$string:app_name"), so it is resolved by its id; a resolution failure
   * falls back to the raw value rather than an empty app name.
   */
  private appName(): string {
    try {
      return this.context.resourceManager.getStringSync(
        this.context.applicationInfo.labelId,
      );
    } catch (error) {
      return this.context.applicationInfo.label;
    }
  }
}

import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { abilityAccessCtrl, bundleManager, common, Permissions } from '@kit.AbilityKit';
import { Environment, fileIo as fs } from '@kit.CoreFileKit';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { connection } from '@kit.NetworkKit';

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
 * The app's own ArkTS side of the platform-capability page.
 *
 * The three capabilities this module backs (device information, network status
 * and the storage directories) all need `@ohos.*` APIs that no React Native JS
 * module can reach on this device, so the readings live here and the JS side
 * only formats what came back. The implementations follow the KMP build's
 * already-verified ArkTS capabilities
 * (`harmonyApp/entry/src/main/ets/capabilities`), which is why the directory
 * notes and the 801 handling match it.
 *
 * Every method is asynchronous from JS's point of view: the C++ side registers
 * them with `ARK_ASYNC_METHOD_METADATA`, so returning a resolved promise is the
 * contract.
 */
export class CapabilityProbeTurboModule extends TurboModule {
  private context: common.UIAbilityContext;

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

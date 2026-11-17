import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { wifiManager } from '@kit.ConnectivityKit';
import { geoLocationManager } from '@kit.LocationKit';
import { BusinessError } from '@kit.BasicServicesKit';

/** One access point, reduced to what the capability card prints. */
export interface WifiAccessPointPayload {
  ssid: string;
  /** dBm; stronger (closer to zero) is better. */
  rssi: number;
  /** True for WEP / WPA / WPA2 / WPA3 / EAP / OWE / WAPI, false for OPEN. */
  secured: boolean;
  /** `wifiManager.WifiSecurityType`, passed back when connecting. */
  securityType: number;
  /** Short human label: 开放 / WEP / WPA / WPA2 / WPA3 / EAP / OWE / WAPI. */
  security: string;
}

/** The scan answer: the list plus the two switches that decide what it means. */
export interface WifiScanPayload {
  accessPoints: WifiAccessPointPayload[];
  /** False when Wi-Fi itself is off; an empty list then is not "no AP". */
  wifiActive: boolean;
  /** The system location switch, read with `geoLocationManager.isLocationEnabled()`. */
  locationEnabled: boolean;
  /** '' or why the scan/read did not produce a fresh list. */
  reason: string;
}

/** One connect attempt. `userDeclined` is the system trust dialog being cancelled. */
export interface WifiConnectPayload {
  /** 'connected' | 'userDeclined' | 'failed'. */
  outcome: string;
  /** Why it failed; '' for the other two outcomes. */
  reason: string;
}

/** One read of the linked network. `known` is false when the platform refused. */
export interface WifiSsidPayload {
  known: boolean;
  /** '' when not linked, or when the platform refused to tell. */
  ssid: string;
  reason: string;
}

/** How long the app waits for `wifiScanStateChange` before reading the cache. */
const SCAN_WAIT_MILLIS = 6000;
/** Connect polling: 30 s, enough for the system dialog plus association. */
const CONNECT_POLL_MILLIS = 500;
const CONNECT_POLL_COUNT = 60;

/**
 * The app's own HarmonyOS Wi-Fi module for the platform-capability page.
 *
 * The KMP build's `WifiNetworkCapability.ets` is the reference; this port keeps
 * its two hard constraints:
 *
 * 1. **Scanning is a read of the system's scan cache.** Active scanning
 *    (`scan()`, deprecated since API 10, and `startScan()` since API 21) is
 *    asked for as a refresh, but the list itself comes from
 *    `getScanInfoList()`, so a rate-limited or refused refresh still shows the
 *    system's latest results instead of an invented list.
 * 2. **Connecting uses the candidate route.** `addCandidateConfig()` +
 *    `connectToCandidateConfigWithUserAction()` are the normal-app path;
 *    `connectToNetwork()` needs the system_core MANAGE_WIFI_CONNECTION
 *    permission this app cannot hold.
 *
 * An empty list is never flattened into "附近没有 WiFi". The payload carries
 * `wifiActive` and `locationEnabled`; the JS side chooses the sentence, so a
 * location switch that is off is reported as exactly that.
 *
 * Permissions: GET_WIFI_INFO / SET_WIFI_INFO are system_grant + normal on the
 * device (install-granted). The only runtime request on this path is
 * APPROXIMATELY_LOCATION, made by the page through `CapabilityProbe` before the
 * first scan; the platform still hides results when the location switch is off.
 */
export class WifiNetworkTurboModule extends TurboModule {
  constructor(ctx: TurboModuleContext) {
    super(ctx);
  }

  /** Asks the system to refresh its scan cache, then returns the current list. */
  async scan(): Promise<WifiScanPayload> {
    const wifiActive = this.isWifiActive();
    const locationEnabled = this.isLocationEnabled();
    if (!wifiActive) {
      return {
        accessPoints: [],
        wifiActive: false,
        locationEnabled: locationEnabled,
        reason: '',
      };
    }

    const scanReason = await this.triggerScan();
    let results: wifiManager.WifiScanInfo[] = [];
    let readReason = '';
    try {
      results = wifiManager.getScanInfoList();
    } catch (error) {
      readReason = `读取扫描结果失败：${this.describe(error as BusinessError)}`;
    }
    return {
      accessPoints: this.toAccessPoints(results),
      wifiActive: true,
      locationEnabled: locationEnabled,
      reason: readReason.length > 0 ? readReason : scanReason,
    };
  }

  /** The SSID the device is linked to; `known` is false only on a refusal. */
  async currentSsid(): Promise<WifiSsidPayload> {
    try {
      const linked: wifiManager.WifiLinkedInfo = wifiManager.getLinkedInfoSync();
      const ssid = typeof linked.ssid === 'string' ? linked.ssid.trim() : '';
      return { known: true, ssid: ssid, reason: '' };
    } catch (error) {
      const failure = error as BusinessError;
      // 2501001 is "Wi-Fi STA disabled": not linked is an ordinary answer, not
      // a failure of the row. Other codes are real refusals, reported as unknown.
      if (failure.code === 2501001) {
        return { known: true, ssid: '', reason: '' };
      }
      return {
        known: false,
        ssid: '',
        reason: `读取当前 SSID 失败：${this.describe(failure)}`,
      };
    }
  }

  /**
   * Connects through the candidate route. A secured AP needs its password;
   * enterprise/WAPI types are refused with the reason instead of being sent
   * with fields the config does not have.
   */
  async connect(
    ssid: string,
    password: string,
    securityType: number,
  ): Promise<WifiConnectPayload> {
    const name = typeof ssid === 'string' ? ssid.trim() : '';
    if (name.length === 0) {
      return this.failure('没有指定要连接的 SSID');
    }
    if (!this.isWifiActive()) {
      return this.failure('Wi-Fi 未打开：请先在控制中心打开 Wi-Fi');
    }
    const config = this.configFor(name, password, securityType);
    if (config === null) {
      return this.failure(
        `该 AP 的加密类型（${this.securityLabel(securityType, '')}）不能通过候选网络连接：` +
          '企业认证（EAP）和 WAPI 需要账号/证书配置，本页未支持。',
      );
    }

    let networkId = -1;
    try {
      networkId = await wifiManager.addCandidateConfig(config);
    } catch (error) {
      return this.failure(
        `添加候选网络失败：${this.describe(error as BusinessError)}`,
      );
    }
    if (networkId < 0) {
      return this.failure('添加候选网络失败：系统没有返回网络 id');
    }

    try {
      await this.connectCandidate(networkId);
    } catch (error) {
      const failure = error as BusinessError;
      if (failure.code === 2501005 || failure.code === 2501006) {
        // The system's trust dialog was dismissed or timed out. The platform
        // does not distinguish "cancelled" from "could not connect" here; the
        // page prints it as the same UserDeclined answer the KMP build does.
        return { outcome: 'userDeclined', reason: '' };
      }
      return this.failure(`发起连接失败：${this.describe(failure)}`);
    }

    for (let attempt = 0; attempt < CONNECT_POLL_COUNT; attempt++) {
      await this.sleep(CONNECT_POLL_MILLIS);
      if (this.linkedSsid() === name) {
        return { outcome: 'connected', reason: '' };
      }
    }
    return this.failure(
      `系统已接受候选网络，但 ${(CONNECT_POLL_COUNT * CONNECT_POLL_MILLIS) / 1000} ` +
        `秒内没有连上 ${name}（密码错误、AP 不在范围内或系统限制）`,
    );
  }

  /**
   * API 20's `connectToCandidateConfigWithUserAction` waits for the system
   * trust dialog and reports 2501005/2501006; the older call only shows the
   * dialog and returns immediately. Use the user-action form when present.
   */
  private async connectCandidate(networkId: number): Promise<void> {
    const withUserAction = wifiManager.connectToCandidateConfigWithUserAction;
    if (withUserAction !== undefined) {
      await withUserAction(networkId);
      return;
    }
    wifiManager.connectToCandidateConfig(networkId);
  }

  /**
   * `startScan()` (API 21+, SET_WIFI_INFO only) is the current refresh call;
   * the deprecated `scan()` is only a fallback for older runtimes. Either way,
   * the result list is read from `getScanInfoList()` afterwards.
   */
  private async triggerScan(): Promise<string> {
    try {
      if (wifiManager.startScan !== undefined) {
        wifiManager.startScan();
      } else {
        wifiManager.scan();
      }
    } catch (error) {
      return `发起扫描失败：${this.describe(error as BusinessError)}`;
    }
    const state = await this.waitForScanState();
    if (state === 1) {
      return '';
    }
    if (state === 0) {
      return '系统报告扫描失败（wifiScanStateChange = 0）';
    }
    return '扫描超时，显示系统最近一次扫描结果';
  }

  /** Waits for the scan-state event: 1 success, 0 failure, -1 timeout. */
  private waitForScanState(): Promise<number> {
    return new Promise<number>((resolve: (state: number) => void) => {
      let settled = false;
      let timer = -1;
      const finish = (state: number): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer >= 0) {
          clearTimeout(timer);
        }
        try {
          wifiManager.off('wifiScanStateChange', listener);
        } catch (error) {
          // Unregistering after a failed scan is best-effort; nothing to report.
        }
        resolve(state);
      };
      const listener = (state: number): void => {
        finish(state === 1 ? 1 : 0);
      };
      try {
        wifiManager.on('wifiScanStateChange', listener);
      } catch (error) {
        resolve(-1);
        return;
      }
      timer = setTimeout(() => {
        finish(-1);
      }, SCAN_WAIT_MILLIS);
    });
  }

  /** Builds the candidate config, or null for a type this page cannot fill. */
  private configFor(
    ssid: string,
    password: string,
    securityType: number,
  ): wifiManager.WifiDeviceConfig | null {
    const value = typeof password === 'string' ? password : '';
    switch (securityType) {
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN:
        return {
          ssid: ssid,
          preSharedKey: '',
          securityType: wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN,
        };
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_WEP:
        return {
          ssid: ssid,
          preSharedKey: value,
          securityType: wifiManager.WifiSecurityType.WIFI_SEC_TYPE_WEP,
        };
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_PSK:
        return {
          ssid: ssid,
          preSharedKey: value,
          securityType: wifiManager.WifiSecurityType.WIFI_SEC_TYPE_PSK,
        };
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_SAE:
        return {
          ssid: ssid,
          preSharedKey: value,
          securityType: wifiManager.WifiSecurityType.WIFI_SEC_TYPE_SAE,
        };
      default:
        return null;
    }
  }

  /** Sorts by RSSI and folds duplicate SSIDs (2.4/5 GHz) to the strongest. */
  private toAccessPoints(
    results: wifiManager.WifiScanInfo[],
  ): WifiAccessPointPayload[] {
    const strongest = new Map<string, WifiAccessPointPayload>();
    for (const result of results) {
      const ssid = typeof result.ssid === 'string' ? result.ssid.trim() : '';
      if (ssid.length === 0) {
        continue;
      }
      const securityType = typeof result.securityType === 'number'
        ? result.securityType
        : wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN;
      const candidate: WifiAccessPointPayload = {
        ssid: ssid,
        rssi: typeof result.rssi === 'number' ? result.rssi : -127,
        secured: securityType !== wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN,
        securityType: securityType,
        security: this.securityLabel(securityType, result.capabilities ?? ''),
      };
      const previous = strongest.get(ssid);
      if (previous === undefined || candidate.rssi > previous.rssi) {
        strongest.set(ssid, candidate);
      }
    }
    const accessPoints: WifiAccessPointPayload[] = [];
    strongest.forEach((accessPoint: WifiAccessPointPayload) => {
      accessPoints.push(accessPoint);
    });
    accessPoints.sort(
      (a: WifiAccessPointPayload, b: WifiAccessPointPayload) => b.rssi - a.rssi,
    );
    return accessPoints;
  }

  /**
   * A short label for the row. `capabilities` (e.g. `[WPA2-PSK-CCMP][ESS]`)
   * distinguishes WPA2 from WPA where the security enum only says PSK.
   */
  private securityLabel(securityType: number, capabilities: string): string {
    if (securityType === wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OPEN) {
      return '开放';
    }
    if (securityType === wifiManager.WifiSecurityType.WIFI_SEC_TYPE_SAE) {
      return 'WPA3';
    }
    const caps = capabilities.toUpperCase();
    if (caps.includes('WPA3')) {
      return 'WPA3';
    }
    if (caps.includes('WPA2')) {
      return 'WPA2';
    }
    if (caps.includes('WPA')) {
      return 'WPA';
    }
    switch (securityType) {
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_WEP:
        return 'WEP';
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_EAP:
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_EAP_SUITE_B:
        return 'EAP';
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_OWE:
        return 'OWE';
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_WAPI_CERT:
      case wifiManager.WifiSecurityType.WIFI_SEC_TYPE_WAPI_PSK:
        return 'WAPI';
      default:
        return '加密';
    }
  }

  private isWifiActive(): boolean {
    try {
      return wifiManager.isWifiActive();
    } catch (error) {
      return false;
    }
  }

  private isLocationEnabled(): boolean {
    try {
      return geoLocationManager.isLocationEnabled();
    } catch (error) {
      return false;
    }
  }

  /** The linked SSID; '' when not linked or when the read is refused. */
  private linkedSsid(): string {
    try {
      const linked: wifiManager.WifiLinkedInfo = wifiManager.getLinkedInfoSync();
      return typeof linked.ssid === 'string' ? linked.ssid.trim() : '';
    } catch (error) {
      return '';
    }
  }

  private sleep(millis: number): Promise<void> {
    return new Promise<void>((resolve: () => void) => {
      setTimeout(resolve, millis);
    });
  }

  private failure(reason: string): WifiConnectPayload {
    return { outcome: 'failed', reason: reason };
  }

  private describe(error: BusinessError): string {
    if (error !== undefined && error !== null && error.code !== undefined) {
      return `${error.code} ${error.message ?? ''}`.trim();
    }
    return `${error}`;
  }
}

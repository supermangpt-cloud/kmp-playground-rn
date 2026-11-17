/**
 * Platform-capability page: the RN port of KMP's `CapabilitiesScreen.kt`.
 *
 * All 14 capabilities of the KMP build are listed with the same titles,
 * descriptions and order. A capability the RN app really implements calls the
 * platform from its row; the rest print `RN 版本暂未实现` where the KMP page puts
 * its button, so a row never looks tappable and then does nothing.
 *
 * The implemented rows run through `src/native/*` wrappers: the app's own
 * `CapabilityProbe` ArkTS module for the device/network/directory, haptics,
 * share and permission calls, and the adapted libraries for storage, clipboard
 * and the system photo picker. Results are printed inside the row, like KMP's
 * `ResultLine`; the 动态权限 and 存储目录 cards keep per-row state so scrolling
 * does not forget it.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  CAPABILITIES,
  Capability,
  CapabilityAction,
  UNIMPLEMENTED_NOTE,
} from '../data/capabilities';
import {BLUETOOTH_NOTE, WIFI_NOTE} from '../data/capabilityCatalog';
import {DIRECTORY_LABELS} from '../data/directories';
import {getItem, removeItem, setItem} from '../native/asyncStorage';
import {
  BleConnectFailure,
  BleDevice,
  connectDevice,
  disconnectDevice,
  onDeviceDisconnected,
  readBluetoothState,
  startScan,
  stopScan,
} from '../native/bluetoothLe';
import {
  getString as readClipboard,
  setString as writeClipboard,
} from '../native/clipboard';
import {readDeviceInfo} from '../native/deviceInfo';
import {HapticStrength, vibrate} from '../native/haptics';
import {launchImageLibrary} from '../native/imagePicker';
import {qrSaveTitle, savePngToAlbum} from '../native/imageSave';
import {NetworkStatus, readNetworkStatus} from '../native/networkStatus';
import {
  openAlbumWritePermissionSettings,
  openPermissionSettings,
  PERMISSION_PLATFORM_NOTE,
  PERMISSIONS,
  permissionAdvice,
  permissionStateLabel,
  PermissionId,
  PermissionState,
  readPermissionState,
  requestPermission,
  requestWifiScanPermission,
  showsPermissionSettings,
} from '../native/permissions';
import {decodeImage, isNativeScanAvailable} from '../native/scanKit';
import {
  DirectoryKind,
  readDirectories,
  StorageDirectory,
} from '../native/storageDirectories';
import {SHARE_DEMO_TEXT, shareText} from '../native/systemShare';
import {DEMO_URL, openExternalUrl} from '../native/urlOpener';
import {
  connectWifi,
  readCurrentSsid,
  scanWifi,
  WifiAccessPoint,
  WifiScanResult,
} from '../native/wifiNetwork';
import {encodeQr} from '../qr/qrCode';
import {decodeQrFromBase64} from '../qr/imageDecode';
import {qrPngBase64} from '../qr/qrPng';
import {colors} from '../ui/theme';

type Props = {
  onBack: () => void;
};

/** What a row prints under its header after its button ran. */
type RowOutcome =
  | {kind: 'busy'}
  | {kind: 'done'; text: string}
  | {kind: 'denied'; text: string}
  | {kind: 'error'; text: string};

/** The demo QR the 保存图片到相册 row writes, same value as the QR page. */
const DEMO_QR_TEXT = 'https://example.com';

/** The 存储目录 card's own state: its rows, last read and last copy. */
type DirectoriesState = {
  status: 'loading' | 'loaded' | 'error';
  rows: StorageDirectory[];
  message?: string;
  copiedKind?: DirectoryKind;
};

/** One 动态权限 row: the last state, the running action and its last message. */
type PermissionRowState = {
  /** Absent until 查询 or 申请 produced an answer. */
  state?: PermissionState;
  busy?: 'query' | 'request' | 'settings';
  message?: {text: string; error: boolean};
};

type PermissionsState = Record<string, PermissionRowState>;

/** The 蓝牙 LE card's own state: the scan, its results and the live links. */
type BluetoothState = {
  scanning: boolean;
  /** De-duplicated by `id` and sorted by RSSI; the page never holds the raw stream. */
  devices: BleDevice[];
  /** Device ids the platform reported as connected. */
  connected: Record<string, boolean>;
  /** The device whose connect/disconnect is running, if any. */
  busyId?: string;
  message?: {text: string; error: boolean};
};

/** The WiFi card's own state: the scan, the link and the password prompt. */
type WifiState = {
  scanning: boolean;
  /** Whether a scan finished; distinguishes "not asked yet" from "none". */
  scanned: boolean;
  accessPoints: WifiAccessPoint[];
  /** The SSID a successful connect reported; shown as 已连接 on that row. */
  connectedSsid?: string;
  /** The AP whose connect is running, if any. */
  busySsid?: string;
  message?: {text: string; error: boolean};
  /** A secured AP waiting for its password, and the text typed so far. */
  passwordTarget?: WifiAccessPoint;
  password: string;
};

/** One button of the 震动 / 触觉 row, in the KMP order. */
const HAPTIC_STRENGTHS: readonly {strength: HapticStrength; label: string}[] = [
  {strength: 'light', label: '轻'},
  {strength: 'medium', label: '中'},
  {strength: 'heavy', label: '重'},
];

/** Key KMP's storage demo uses; removed at the end of every round trip. */
const STORAGE_DEMO_KEY = 'platform_capabilities.demo_key';

/** Four random digits, like KMP's `Random.nextInt(1000, 10_000)`. */
function randomSuffix(): string {
  return String(Math.floor(Math.random() * 9000) + 1000);
}

function statusLabel(capability: Capability): string {
  switch (capability.status) {
    case 'available':
      return '可用';
    case 'limited':
      return '部分可用';
    default:
      return '未实现';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The sentence under the WiFi 扫描 button. The three empty-list causes are kept
 * apart on purpose: Wi-Fi off, location switch off, and a scan that really
 * found nothing are different answers, and the ticket's acceptance checks the
 * middle one by name.
 */
function wifiScanMessage(
  result: WifiScanResult,
  permissionNote = '',
): {text: string; error: boolean} {
  if (!result.wifiActive) {
    return {text: 'Wi-Fi 未打开：请先在控制中心打开 Wi-Fi', error: true};
  }
  // The location switch is a precondition, not a footnote: the system can still
  // hand back a cached list with it off, and the ticket's acceptance asks for
  // the "open 定位" sentence in exactly that state. Do not show the stale list.
  if (!result.locationEnabled) {
    return {
      text: 'WiFi 扫描需要打开系统定位开关：请下拉通知栏打开「定位」后重试',
      error: false,
    };
  }
  if (result.accessPoints.length > 0) {
    return {
      text: `扫描到 ${result.accessPoints.length} 个 AP`,
      error: false,
    };
  }
  if (result.reason.length > 0) {
    return {text: `扫描失败：${result.reason}`, error: true};
  }
  return {
    text: `没有发现 WiFi AP：附近没有 AP，或系统限制了扫描频率${permissionNote}`,
    error: false,
  };
}

/** How the 网络状态 row prints one reading; `unknown` is not guessed. */
function networkText(status: NetworkStatus): string {
  const connection = status.connected ? '已联网' : '未联网';
  const type = status.type === 'unknown' ? '未知' : status.type;
  return `${connection} · ${type}`;
}

type WifiBodyProps = {
  state: WifiState;
  onScan: () => void;
  onCurrentSsid: () => void;
  onConnect: (accessPoint: WifiAccessPoint) => void;
  onPasswordChange: (text: string) => void;
  onPasswordConfirm: () => void;
  onPasswordCancel: () => void;
};

/**
 * The WiFi card body, ported from KMP's `WifiNetworkRow`: 扫描 and 当前 SSID in
 * the header, then one row per AP (SSID + RSSI + encryption + 连接). A secured
 * AP opens the inline password panel first; an open one connects directly.
 *
 * The two notes are part of the answer, not decoration: the candidate route
 * shows a system trust dialog whose dismissal comes back as 已取消, and an
 * empty list is separated from "location is off" by the sentence above the
 * list. The list scrolls inside the card (220 vp, like KMP's
 * `SCAN_LIST_MAX_HEIGHT`) so a crowded room does not push the rest of the page
 * down.
 */
function WifiBody({
  state,
  onScan,
  onCurrentSsid,
  onConnect,
  onPasswordChange,
  onPasswordConfirm,
  onPasswordCancel,
}: WifiBodyProps): JSX.Element {
  const scanning = state.scanning;
  return (
    <View style={styles.wifi}>
      <View style={styles.wifiHeader}>
        <Text style={styles.wifiCount} testID="capability-wifi-count">
          {scanning
            ? '扫描中…'
            : state.accessPoints.length > 0
            ? `共 ${state.accessPoints.length} 个 AP`
            : '尚未扫描'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="扫描附近的 WiFi AP"
          disabled={scanning}
          onPress={onScan}
          style={({pressed}) => [
            styles.wifiScanButton,
            scanning && styles.wifiScanDisabled,
            pressed && styles.pressed,
          ]}
          testID="capability-wifi-scan">
          <Text style={styles.wifiScanText}>
            {scanning ? '扫描中…' : '扫描'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="读取当前 SSID"
          onPress={onCurrentSsid}
          style={({pressed}) => [
            styles.wifiCurrentButton,
            pressed && styles.pressed,
          ]}
          testID="capability-wifi-current">
          <Text style={styles.wifiCurrentText}>当前 SSID</Text>
        </Pressable>
      </View>

      <Text style={styles.wifiNote} testID="capability-wifi-note">
        {WIFI_NOTE}
      </Text>

      {state.message === undefined ? null : (
        <Text
          style={[
            styles.wifiMessage,
            state.message.error && styles.wifiMessageError,
          ]}
          testID="capability-wifi-message">
          {state.message.text}
        </Text>
      )}

      {state.passwordTarget === undefined ? null : (
        <View
          style={styles.wifiPasswordPanel}
          testID="capability-wifi-password-panel">
          <Text style={styles.wifiPasswordTitle}>
            连接 {state.passwordTarget.ssid}
          </Text>
          <TextInput
            value={state.password}
            onChangeText={onPasswordChange}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Wi-Fi 密码"
            style={styles.wifiPasswordInput}
            testID="capability-wifi-password"
          />
          <View style={styles.wifiPasswordActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="使用这个密码连接"
              accessibilityState={{disabled: state.password.length === 0}}
              disabled={state.password.length === 0}
              onPress={onPasswordConfirm}
              style={({pressed}) => [
                styles.wifiPasswordConfirm,
                state.password.length === 0 && styles.wifiScanDisabled,
                pressed && styles.pressed,
              ]}
              testID="capability-wifi-password-confirm">
              <Text style={styles.wifiPasswordConfirmText}>连接</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消输入密码"
              onPress={onPasswordCancel}
              style={({pressed}) => [
                styles.wifiPasswordCancel,
                pressed && styles.pressed,
              ]}
              testID="capability-wifi-password-cancel">
              <Text style={styles.wifiPasswordCancelText}>取消</Text>
            </Pressable>
          </View>
        </View>
      )}

      {state.scanned || state.accessPoints.length > 0 ? null : (
        <Text style={styles.wifiHint} testID="capability-wifi-hint">
          点「扫描」列出附近的 WiFi AP
        </Text>
      )}

      {state.accessPoints.length === 0 ? null : (
        <ScrollView
          style={styles.wifiList}
          nestedScrollEnabled
          testID="capability-wifi-aps">
          {state.accessPoints.map((accessPoint, index) => {
            const connected = state.connectedSsid === accessPoint.ssid;
            const busy = state.busySsid === accessPoint.ssid;
            return (
              <View
                key={`${accessPoint.ssid}-${index}`}
                style={styles.wifiRow}
                testID={`capability-wifi-ap-${index}`}>
                <View style={styles.wifiRowText}>
                  <Text
                    style={[
                      styles.wifiSsid,
                      connected && styles.wifiSsidConnected,
                    ]}
                    numberOfLines={1}>
                    {accessPoint.ssid}
                  </Text>
                  <Text style={styles.wifiMeta}>
                    RSSI {accessPoint.rssi} · {accessPoint.security}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`连接 ${accessPoint.ssid}`}
                  disabled={busy || connected || scanning}
                  onPress={() => onConnect(accessPoint)}
                  style={({pressed}) => [
                    styles.wifiConnectButton,
                    connected && styles.wifiConnectedButton,
                    busy && styles.wifiScanDisabled,
                    pressed && styles.pressed,
                  ]}
                  testID={`capability-wifi-connect-${index}`}>
                  <Text
                    style={[
                      styles.wifiConnectText,
                      connected && styles.wifiConnectedText,
                    ]}>
                    {busy ? '连接中…' : connected ? '已连接' : '连接'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

type DirectoriesBodyProps = {
  state: DirectoriesState;
  onRefresh: () => void;
  onCopy: (directory: StorageDirectory) => void;
};

/**
 * The 存储目录 card body: `共 N 项` + 刷新, then one row per directory.
 *
 * A row with a path shows `存在` / `不存在` and a 复制 button; a row without one
 * (the album, and the public directories on a phone) puts the explanation where
 * the path would be instead of inventing a path. The path wraps in full — no
 * ellipsis — because the point of the card is the real absolute path.
 */
function DirectoriesBody({
  state,
  onRefresh,
  onCopy,
}: DirectoriesBodyProps): JSX.Element {
  const loading = state.status === 'loading';
  return (
    <View style={styles.directories}>
      <View style={styles.directoriesHeader}>
        <Text
          style={styles.directoriesCount}
          testID="capability-directories-count">
          {loading && state.rows.length === 0
            ? '读取中…'
            : `共 ${state.rows.length} 项`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="刷新"
          disabled={loading}
          onPress={onRefresh}
          style={({pressed}) => [
            styles.directoryRefresh,
            loading && styles.directoryRefreshDisabled,
            pressed && styles.pressed,
          ]}
          testID="capability-directories-refresh">
          <Text style={styles.directoryRefreshText}>
            {loading ? '读取中…' : '刷新'}
          </Text>
        </Pressable>
      </View>

      {state.message === undefined ? null : (
        <Text
          style={styles.directoryMessage}
          testID="capability-directories-message">
          {state.message}
        </Text>
      )}

      {state.rows.length === 0 ? (
        <Text
          style={styles.directoriesHint}
          testID="capability-directories-hint">
          {loading ? '读取中…' : '点「刷新」读取当前平台的目录'}
        </Text>
      ) : (
        state.rows.map(directory => {
          const path = directory.path;
          return (
            <View
              key={directory.kind}
              style={styles.directoryRow}
              testID={`capability-directory-row-${directory.kind}`}>
              <View style={styles.directoryRowHeader}>
                <Text style={styles.directoryLabel}>
                  {DIRECTORY_LABELS[directory.kind]}
                </Text>
                {path === undefined ? null : (
                  <>
                    <Text
                      style={[
                        styles.directoryExists,
                        directory.exists
                          ? styles.directoryExistsYes
                          : styles.directoryExistsNo,
                      ]}
                      testID={`capability-directory-exists-${directory.kind}`}>
                      {directory.exists ? '存在' : '不存在'}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`复制${
                        DIRECTORY_LABELS[directory.kind]
                      }路径`}
                      onPress={() => onCopy(directory)}
                      style={({pressed}) => [
                        styles.directoryCopyButton,
                        pressed && styles.pressed,
                      ]}
                      testID={`capability-directory-copy-${directory.kind}`}>
                      <Text style={styles.directoryCopyText}>复制</Text>
                    </Pressable>
                  </>
                )}
              </View>

              {path === undefined ? (
                <Text
                  style={styles.directoryNote}
                  testID={`capability-directory-path-${directory.kind}`}>
                  {directory.note ?? '该目录在当前平台不可用'}
                </Text>
              ) : (
                <>
                  <Text
                    style={styles.directoryPath}
                    testID={`capability-directory-path-${directory.kind}`}>
                    {path}
                  </Text>
                  {directory.note === undefined ? null : (
                    <Text
                      style={styles.directoryNote}
                      testID={`capability-directory-note-${directory.kind}`}>
                      {directory.note}
                    </Text>
                  )}
                </>
              )}

              {state.copiedKind === directory.kind ? (
                <Text
                  style={styles.directoryCopied}
                  testID={`capability-directory-copied-${directory.kind}`}>
                  已复制
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

/**
 * The 震动 / 触觉 row body: three buttons side by side, exactly like KMP (no
 * separate query button). The result line is the card's shared one.
 */
function HapticsBody({
  onPress,
}: {
  onPress: (strength: HapticStrength) => void;
}): JSX.Element {
  return (
    <View style={styles.hapticsRow}>
      {HAPTIC_STRENGTHS.map(({strength, label}) => (
        <Pressable
          key={strength}
          accessibilityRole="button"
          accessibilityLabel={`${label}震动`}
          onPress={() => onPress(strength)}
          style={({pressed}) => [
            styles.hapticButton,
            pressed && styles.pressed,
          ]}
          testID={`capability-haptic-${strength}`}>
          <Text style={styles.hapticText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The chip colour for one permission state. */
function permissionChipStyles(state?: PermissionState): object[] {
  switch (state) {
    case 'granted':
      return [styles.permissionChip, styles.permissionChipGranted];
    case 'denied':
      return [styles.permissionChip, styles.permissionChipDenied];
    default:
      return [styles.permissionChip, styles.permissionChipUnknown];
  }
}

type PermissionsBodyProps = {
  state: PermissionsState;
  onQuery: (id: PermissionId) => void;
  onRequest: (id: PermissionId) => void;
  onSettings: (id: PermissionId) => void;
};

/**
 * The 动态权限 card body: the platform note and one row per permission.
 *
 * Every row shows its last state (未查询 before the first read), 查询 and 申请,
 * the advice for that state and, once a denial means the system will not show
 * its dialog again, 去设置. The album and contacts rows are marked unavailable
 * with the ACL reason and have no buttons at all: offering one would promise
 * something a normal app cannot obtain.
 */
function PermissionsBody({
  state,
  onQuery,
  onRequest,
  onSettings,
}: PermissionsBodyProps): JSX.Element {
  return (
    <View style={styles.permissions}>
      <Text style={styles.permissionNote} testID="capability-permission-note">
        {PERMISSION_PLATFORM_NOTE}
      </Text>
      {PERMISSIONS.map((permission, index) => {
        const row = state[permission.id] ?? {};
        const unavailable = permission.unavailableReason;
        const running = row.busy !== undefined;
        return (
          <View
            key={permission.id}
            style={[
              styles.permissionRow,
              index > 0 && styles.permissionRowDivided,
            ]}
            testID={`capability-permission-${permission.id}`}>
            <View style={styles.permissionHeader}>
              <Text style={styles.permissionLabel}>{permission.label}</Text>
              {unavailable === undefined ? (
                <Text
                  style={permissionChipStyles(row.state)}
                  testID={`capability-permission-state-${permission.id}`}>
                  {permissionStateLabel(row.state)}
                </Text>
              ) : null}
            </View>

            {unavailable !== undefined ? (
              <Text
                style={styles.permissionUnavailable}
                testID={`capability-permission-unavailable-${permission.id}`}>
                不可用：{unavailable}
              </Text>
            ) : (
              <>
                <View style={styles.permissionButtons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`查询${permission.label}权限`}
                    disabled={running}
                    onPress={() => onQuery(permission.id)}
                    style={({pressed}) => [
                      styles.permissionTextButton,
                      running && styles.permissionButtonDisabled,
                      pressed && styles.pressed,
                    ]}
                    testID={`capability-permission-query-${permission.id}`}>
                    <Text style={styles.permissionTextButtonText}>
                      {row.busy === 'query' ? '查询中…' : '查询'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`申请${permission.label}权限`}
                    disabled={running}
                    onPress={() => onRequest(permission.id)}
                    style={({pressed}) => [
                      styles.permissionRequestButton,
                      running && styles.permissionButtonDisabled,
                      pressed && styles.pressed,
                    ]}
                    testID={`capability-permission-request-${permission.id}`}>
                    <Text style={styles.permissionRequestText}>
                      {row.busy === 'request' ? '申请中…' : '申请'}
                    </Text>
                  </Pressable>
                  {showsPermissionSettings(row.state) ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`打开${permission.label}权限设置`}
                      disabled={running}
                      onPress={() => onSettings(permission.id)}
                      style={({pressed}) => [
                        styles.permissionTextButton,
                        running && styles.permissionButtonDisabled,
                        pressed && styles.pressed,
                      ]}
                      testID={`capability-permission-settings-${permission.id}`}>
                      <Text style={styles.permissionTextButtonText}>
                        {row.busy === 'settings' ? '打开中…' : '去设置'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text
                  style={styles.permissionAdvice}
                  testID={`capability-permission-advice-${permission.id}`}>
                  {permissionAdvice(row.state)}
                </Text>
                {row.message === undefined ? null : (
                  <Text
                    style={[
                      styles.permissionMessage,
                      row.message.error && styles.permissionMessageError,
                    ]}
                    testID={`capability-permission-result-${permission.id}`}>
                    {row.message.text}
                  </Text>
                )}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * One device row's fixed height, in dp. Windowing needs a constant row height,
 * so the row is pinned to it instead of growing with the text.
 */
const BLUETOOTH_ROW_HEIGHT = 48;

/** Rows rendered around the visible window: enough to cover a scroll step. */
const BLUETOOTH_WINDOW_ROWS = 16;

type BluetoothBodyProps = {
  state: BluetoothState;
  onScan: () => void;
  onConnect: (device: BleDevice) => void;
  onDisconnect: (device: BleDevice) => void;
};

/**
 * The 蓝牙 LE card body: 扫描 / 停止, the two platform notes, then one row per
 * advertisement with 连接 (or 断开 once linked).
 *
 * The result list is its own bounded `ScrollView` (240 vp, `nestedScrollEnabled`):
 * a room with dozens of advertisements scrolls inside the card instead of
 * pushing the rest of the page down, and the devices are already de-duplicated
 * and throttled by `src/native/bluetoothLe.ts`. The address row is the
 * HarmonyOS per-app virtual id — it is labelled as such rather than pretended
 * to be a MAC.
 */
function BluetoothBody({
  state,
  onScan,
  onConnect,
  onDisconnect,
}: BluetoothBodyProps): JSX.Element {
  const scanning = state.scanning;
  // The scan list can hold hundreds of addresses (288 unique ones were seen
  // on this device). A plain map over all of them re-renders every row twice a
  // second, so only the visible window plus a margin is mounted; spacers stand
  // in for the rows above and below, which keeps the scroll bar honest.
  const [scrollTop, setScrollTop] = useState(0);
  const total = state.devices.length;
  const first = Math.min(
    Math.max(0, Math.floor(scrollTop / BLUETOOTH_ROW_HEIGHT) - 4),
    Math.max(0, total - 1),
  );
  const last = Math.min(total, first + BLUETOOTH_WINDOW_ROWS + 8);
  const visible = state.devices.slice(first, last);
  return (
    <View style={styles.bluetooth}>
      <View style={styles.bluetoothHeader}>
        <Text style={styles.bluetoothCount} testID="capability-bluetooth-count">
          {scanning
            ? `扫描中… 已发现 ${state.devices.length} 台`
            : state.devices.length === 0
            ? '尚未扫描'
            : `共 ${state.devices.length} 台`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scanning ? '停止扫描' : '扫描附近的蓝牙设备'}
          onPress={onScan}
          style={({pressed}) => [
            styles.bluetoothScanButton,
            scanning && styles.bluetoothScanStop,
            pressed && styles.pressed,
          ]}
          testID="capability-bluetooth-scan">
          <Text style={styles.bluetoothScanText}>
            {scanning ? '停止' : '扫描'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.bluetoothNote} testID="capability-bluetooth-note">
        {BLUETOOTH_NOTE}
      </Text>

      {state.message === undefined ? null : (
        <Text
          style={[
            styles.bluetoothMessage,
            state.message.error && styles.bluetoothMessageError,
          ]}
          testID="capability-bluetooth-message">
          {state.message.text}
        </Text>
      )}

      {state.devices.length === 0 ? (
        <Text style={styles.bluetoothHint} testID="capability-bluetooth-hint">
          {scanning ? '正在扫描…' : '点「扫描」列出附近的 BLE 广播'}
        </Text>
      ) : (
        <ScrollView
          style={styles.bluetoothList}
          nestedScrollEnabled
          scrollEventThrottle={100}
          onScroll={event => setScrollTop(event.nativeEvent.contentOffset.y)}
          testID="capability-bluetooth-devices">
          {first === 0 ? null : (
            <View style={{height: first * BLUETOOTH_ROW_HEIGHT}} />
          )}
          {visible.map(device => {
            const connected = state.connected[device.id] === true;
            const busy = state.busyId === device.id;
            return (
              <View
                key={device.id}
                style={styles.bluetoothRow}
                testID={`capability-bluetooth-device-${device.id}`}>
                <View style={styles.bluetoothRowText}>
                  <Text style={styles.bluetoothName} numberOfLines={1}>
                    {device.name ?? '（未命名设备）'}
                  </Text>
                  <Text style={styles.bluetoothAddress} numberOfLines={1}>
                    {device.id}
                    {device.rssi === undefined ? '' : ` · RSSI ${device.rssi}`}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${connected ? '断开' : '连接'}${
                    device.name ?? device.id
                  }`}
                  disabled={busy}
                  onPress={() =>
                    connected ? onDisconnect(device) : onConnect(device)
                  }
                  style={({pressed}) => [
                    styles.bluetoothConnectButton,
                    connected && styles.bluetoothDisconnectButton,
                    busy && styles.bluetoothConnectDisabled,
                    pressed && styles.pressed,
                  ]}
                  testID={`capability-bluetooth-connect-${device.id}`}>
                  <Text
                    style={[
                      styles.bluetoothConnectText,
                      connected && styles.bluetoothDisconnectText,
                    ]}>
                    {busy
                      ? connected
                        ? '断开中…'
                        : '连接中…'
                      : connected
                      ? '断开'
                      : '连接'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {last >= total ? null : (
            <View style={{height: (total - last) * BLUETOOTH_ROW_HEIGHT}} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

export default function CapabilitiesScreen({onBack}: Props): JSX.Element {
  const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({});
  const [directories, setDirectories] = useState<DirectoriesState>({
    status: 'loading',
    rows: [],
  });
  const [permissions, setPermissions] = useState<PermissionsState>({});
  const [bluetooth, setBluetooth] = useState<BluetoothState>({
    scanning: false,
    devices: [],
    connected: {},
  });
  const [wifi, setWifi] = useState<WifiState>({
    scanning: false,
    scanned: false,
    accessPoints: [],
    password: '',
  });
  // The picker is modal and the button stays mounted while it is open; a ref
  // stops a second press from opening a second picker behind the first.
  const busy = useRef(false);
  // The directory card's 刷新 and its first automatic read share this guard, so
  // the permission request cannot be started twice.
  const readingDirectories = useRef(false);
  // Each permission row keeps its own guard, so asking for one permission does
  // not block another row's 查询.
  const permissionBusy = useRef<Record<string, boolean>>({});
  // The Bluetooth card's guards are separate from `busy`: a connect can wait
  // up to 15 s for the platform while every other row stays usable.
  const bluetoothBusy = useRef(false);
  const bluetoothScanning = useRef(false);
  // The WiFi card's guards are separate too: the connect poll can wait up to
  // 30 s for the system dialog and association while the rest stays usable.
  const wifiBusy = useRef(false);
  const wifiSsidBusy = useRef(false);

  const setOutcome = useCallback((id: string, outcome: RowOutcome) => {
    setOutcomes(current => ({...current, [id]: outcome}));
  }, []);

  const setPermissionRow = useCallback(
    (id: PermissionId, patch: Partial<PermissionRowState>) => {
      setPermissions(current => ({
        ...current,
        [id]: {...current[id], ...patch},
      }));
    },
    [],
  );

  /** 「写 → 读 → 删 → 再读」: the full storage round trip, inline. */
  const storageRoundTrip = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const value = `rn-demo-${randomSuffix()}`;
        await setItem(STORAGE_DEMO_KEY, value);
        const readBack = await getItem(STORAGE_DEMO_KEY);
        await removeItem(STORAGE_DEMO_KEY);
        const afterRemove = await getItem(STORAGE_DEMO_KEY);
        setOutcome(id, {
          kind: 'done',
          text: `写入「${value}」→ 读回「${
            readBack ?? 'null'
          }」→ 删除 → 再读「${afterRemove ?? 'null'}」`,
        });
      } catch (error) {
        setOutcome(id, {kind: 'error', text: `失败：${messageOf(error)}`});
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /**
   * The directory card's read. The first one (page open) passes false so no
   * permission dialog appears; 刷新 passes true and may ask for the two public
   * directory permissions.
   */
  const loadDirectories = useCallback(async (requestPermissions: boolean) => {
    if (readingDirectories.current) {
      return;
    }
    readingDirectories.current = true;
    setDirectories(current => ({
      ...current,
      status: 'loading',
      message: undefined,
      copiedKind: undefined,
    }));
    try {
      const rows = await readDirectories(requestPermissions);
      setDirectories({status: 'loaded', rows});
    } catch (error) {
      // Computed before the state updater: Hermes does not keep the catch
      // binding alive for a closure React calls later, and reading it there
      // throws `Property 'error' does not exist` and takes down the page.
      const text = `读取失败：${messageOf(error)}`;
      setDirectories(current => ({
        ...current,
        status: 'error',
        message: text,
      }));
    } finally {
      readingDirectories.current = false;
    }
  }, []);

  // Opening the page reads what it can without asking for anything; only the
  // explicit 刷新 press may show a permission dialog.
  useEffect(() => {
    loadDirectories(false);
  }, [loadDirectories]);

  /** 「复制」 on one directory row: the path really goes to the clipboard. */
  const copyDirectory = useCallback((directory: StorageDirectory) => {
    const path = directory.path;
    if (path === undefined) {
      return;
    }
    try {
      writeClipboard(path);
      setDirectories(current => ({
        ...current,
        copiedKind: directory.kind,
        message: undefined,
      }));
    } catch (error) {
      setDirectories(current => ({
        ...current,
        message: `复制失败：${messageOf(error)}`,
      }));
    }
  }, []);

  /**
   * 「轻 / 中 / 重」: one tap. A fallback note (the touch-feedback switch made the
   * system drop `physicalFeedback`) is printed, so "nothing felt" is explained
   * rather than left looking like a dead button.
   */
  const triggerHaptic = useCallback(
    async (strength: HapticStrength) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome('haptics', {kind: 'busy'});
      try {
        const result = await vibrate(strength);
        const label =
          HAPTIC_STRENGTHS.find(item => item.strength === strength)?.label ??
          '';
        const suffix = result.note === undefined ? '' : `（${result.note}）`;
        setOutcome('haptics', {
          kind: 'done',
          text: `已触发${label}震动${suffix}`,
        });
      } catch (error) {
        setOutcome('haptics', {
          kind: 'error',
          text: `失败：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「分享文本」: hand the text to the system share panel. */
  const shareDemoText = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        await shareText(SHARE_DEMO_TEXT);
        setOutcome(id, {
          kind: 'done',
          text: `已拉起系统分享面板（内容：${SHARE_DEMO_TEXT}）`,
        });
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `失败：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「查询」 on one permission row: no dialog, just the current state. */
  const queryPermission = useCallback(
    async (id: PermissionId) => {
      if (permissionBusy.current[id]) {
        return;
      }
      permissionBusy.current[id] = true;
      setPermissionRow(id, {busy: 'query', message: undefined});
      try {
        const state = await readPermissionState(id);
        setPermissionRow(id, {state});
      } catch (error) {
        setPermissionRow(id, {
          message: {text: `查询失败：${messageOf(error)}`, error: true},
        });
      } finally {
        permissionBusy.current[id] = false;
        setPermissionRow(id, {busy: undefined});
      }
    },
    [setPermissionRow],
  );

  /** 「申请」 on one permission row: shows the system dialog. */
  const askPermission = useCallback(
    async (id: PermissionId) => {
      if (permissionBusy.current[id]) {
        return;
      }
      permissionBusy.current[id] = true;
      setPermissionRow(id, {busy: 'request', message: undefined});
      try {
        const state = await requestPermission(id);
        setPermissionRow(id, {state});
      } catch (error) {
        setPermissionRow(id, {
          message: {text: `申请失败：${messageOf(error)}`, error: true},
        });
      } finally {
        permissionBusy.current[id] = false;
        setPermissionRow(id, {busy: undefined});
      }
    },
    [setPermissionRow],
  );

  /**
   * 「去设置」: after a denial HarmonyOS will not show its first-run dialog
   * again, so this opens the permission's settings page instead of dead-ending.
   */
  const openSettingsForPermission = useCallback(
    async (id: PermissionId) => {
      if (permissionBusy.current[id]) {
        return;
      }
      permissionBusy.current[id] = true;
      setPermissionRow(id, {busy: 'settings', message: undefined});
      try {
        await openPermissionSettings(id);
        setPermissionRow(id, {
          message: {
            text: '已打开系统设置页；回到 App 后点「查询」刷新状态',
            error: false,
          },
        });
      } catch (error) {
        setPermissionRow(id, {
          message: {text: `打开设置失败：${messageOf(error)}`, error: true},
        });
      } finally {
        permissionBusy.current[id] = false;
        setPermissionRow(id, {busy: undefined});
      }
    },
    [setPermissionRow],
  );

  /** 「读取设备信息」: the real model, system and app build, as the device reports them. */
  const readDevice = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const info = await readDeviceInfo();
        setOutcome(id, {
          kind: 'done',
          text: `${info.model} · ${info.systemName} ${info.systemVersion} · ${info.appName} ${info.appVersion}`,
        });
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `读取失败：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「查询网络」: a fresh read on every press, so a changed network shows. */
  const probeNetwork = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const status = await readNetworkStatus();
        setOutcome(id, {kind: 'done', text: networkText(status)});
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `读取失败：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「打开链接」: the shared guard runs before the system browser sees it. */
  const openLink = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const result = await openExternalUrl(DEMO_URL);
        if (result.ok) {
          setOutcome(id, {
            kind: 'done',
            text: `已交给系统浏览器：${result.url}`,
          });
        } else {
          setOutcome(id, {kind: 'error', text: result.reason});
        }
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `无法打开链接：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /**
   * 「写入 → 读回」: the write always runs; a refused read is reported as the
   * platform limitation (HarmonyOS only grants clipboard reads to PasteButton),
   * not as a generic failure.
   */
  const clipboardRoundTrip = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      const value = `RN 剪贴板演示 ${randomSuffix()}`;
      try {
        writeClipboard(value);
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `写入失败：${messageOf(error)}`,
        });
        busy.current = false;
        return;
      }
      try {
        const readBack = await readClipboard();
        setOutcome(id, {
          kind: 'done',
          text: `写入「${value}」→ 读回「${readBack}」`,
        });
      } catch (error) {
        setOutcome(id, {
          kind: 'done',
          text: `写入「${value}」成功；读回失败：${messageOf(
            error,
          )}（读取需要系统 PasteButton 安全控件授权）`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「从相册选图」: open the system picker and describe what came back. */
  const pickImage = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const result = await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 1,
        });
        if (result.didCancel === true) {
          setOutcome(id, {kind: 'done', text: '已取消选图'});
          return;
        }
        if (result.errorCode !== undefined) {
          setOutcome(id, {
            kind: 'error',
            text: `无法打开相册：${result.errorMessage ?? result.errorCode}`,
          });
          return;
        }
        const asset = result.assets?.[0];
        // The HarmonyOS picker reports a back-press cancel as an empty asset
        // list without `didCancel`, so an empty result is a cancel too.
        if (asset === undefined) {
          setOutcome(id, {kind: 'done', text: '已取消选图'});
          return;
        }
        const size =
          asset.fileSize !== undefined
            ? `${asset.fileSize} 字节`
            : asset.width !== undefined && asset.height !== undefined
            ? `${asset.width}×${asset.height}`
            : '大小未知';
        setOutcome(id, {
          kind: 'done',
          text: `已选择：${asset.fileName ?? '（无文件名）'} · ${
            asset.type ?? '未知类型'
          } · ${size}`,
        });
      } catch (error) {
        setOutcome(id, {kind: 'error', text: `失败：${messageOf(error)}`});
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /**
   * 「保存图片到相册」: the same path as the QR page's button. The demo code is
   * encoded and turned into a PNG in JS, then the app's `ImageSave` module asks
   * for WRITE_IMAGEVIDEO, creates the album asset and writes the bytes.
   */
  const saveDemoImage = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const encoding = encodeQr(DEMO_QR_TEXT, 'M');
        if (!encoding.ok) {
          setOutcome(id, {
            kind: 'error',
            text: `无法生成二维码：${encoding.error}`,
          });
          return;
        }
        const result = await savePngToAlbum(
          qrPngBase64(encoding.code),
          qrSaveTitle(),
        );
        if (result.saved) {
          setOutcome(id, {
            kind: 'done',
            text: `已保存到相册（${result.title}）`,
          });
        } else if (result.permissionDenied) {
          setOutcome(id, {
            kind: 'denied',
            text: permissionAdvice('denied'),
          });
        } else {
          setOutcome(id, {kind: 'error', text: `保存失败：${result.reason}`});
        }
      } catch (error) {
        setOutcome(id, {kind: 'error', text: `保存失败：${messageOf(error)}`});
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「去设置」 for the 保存图片到相册 row after the album permission is refused. */
  const openSaveImageSettings = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      try {
        await openAlbumWritePermissionSettings();
        setOutcome(id, {
          kind: 'denied',
          text: '已打开系统设置页；回到 App 后重新点「保存图片到相册」',
        });
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `打开设置失败：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /**
   * 「图片解析二维码」: pick one image and decode it, through Scan Kit when the
   * native module is registered and through `jsqr` otherwise — the same two
   * paths the scan page's 从相册选图 uses.
   */
  const decodePickedImage = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const nativeDecode = isNativeScanAvailable();
        const result = await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 1,
          maxWidth: 2000,
          maxHeight: 2000,
          // The native decoder reads the cache file; only the JS fallback needs
          // the memory-heavy base64 of the image.
          includeBase64: !nativeDecode,
        });
        if (result.didCancel === true) {
          setOutcome(id, {kind: 'done', text: '已取消选图'});
          return;
        }
        if (result.errorCode !== undefined) {
          setOutcome(id, {
            kind: 'error',
            text: `无法打开相册：${result.errorMessage ?? result.errorCode}`,
          });
          return;
        }
        const asset = result.assets?.[0];
        if (asset === undefined) {
          setOutcome(id, {kind: 'done', text: '已取消选图'});
          return;
        }
        if (nativeDecode && asset.uri !== undefined) {
          const native = await decodeImage(asset.uri);
          if (native.ok) {
            setOutcome(id, {
              kind: 'done',
              text: `解析到 ${native.values.length} 个：${native.values[0]}`,
            });
            return;
          }
          if (asset.base64 === undefined) {
            setOutcome(id, {kind: 'error', text: `失败：${native.error}`});
            return;
          }
        }
        if (asset.base64 === undefined) {
          setOutcome(id, {
            kind: 'error',
            text: '失败：图片选择器没有返回可用于解码的数据',
          });
          return;
        }
        const decoded = decodeQrFromBase64(asset.base64);
        if (!decoded.ok) {
          setOutcome(id, {kind: 'error', text: decoded.reason});
          return;
        }
        setOutcome(id, {kind: 'done', text: `解析到 1 个：${decoded.value}`});
      } catch (error) {
        setOutcome(id, {kind: 'error', text: `失败：${messageOf(error)}`});
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /**
   * 「扫描 / 停止」: asks for ACCESS_BLUETOOTH first, refuses to fake an empty
   * list when Bluetooth is off, then starts the throttled scan.
   */
  const toggleBluetoothScan = useCallback(async () => {
    if (bluetoothBusy.current) {
      return;
    }
    if (bluetoothScanning.current) {
      bluetoothScanning.current = false;
      try {
        await stopScan();
      } catch {
        // Nothing to stop any more; the button still has to return to 扫描.
      }
      setBluetooth(current => ({...current, scanning: false}));
      return;
    }
    bluetoothBusy.current = true;
    try {
      const permission = await requestPermission('bluetooth');
      if (permission !== 'granted') {
        setBluetooth(current => ({
          ...current,
          message: {
            text: '没有蓝牙权限：请到上方「动态权限」卡片的蓝牙行点「去设置」打开后重试',
            error: true,
          },
        }));
        return;
      }
      const power = await readBluetoothState();
      if (power === 'off') {
        // An empty list would look like "no devices nearby", which is wrong.
        setBluetooth(current => ({
          ...current,
          devices: [],
          scanning: false,
          message: {text: '蓝牙已关闭，请先打开系统蓝牙再扫描', error: true},
        }));
        return;
      }
      await startScan({
        onDevices: devices => setBluetooth(current => ({...current, devices})),
        onError: text =>
          setBluetooth(current => ({
            ...current,
            message: {text, error: true},
          })),
      });
      bluetoothScanning.current = true;
      setBluetooth(current => ({
        ...current,
        scanning: true,
        devices: [],
        message:
          power === 'unknown'
            ? {text: '平台返回的蓝牙状态是「未知」，扫描仍会尝试', error: false}
            : undefined,
      }));
    } catch (error) {
      // The reason is computed here, not inside the state updater: Hermes does
      // not keep a catch binding alive for a closure React calls later, and
      // reading it then throws `ReferenceError: Property 'error' does not exist`.
      const text = messageOf(error);
      bluetoothScanning.current = false;
      setBluetooth(current => ({
        ...current,
        scanning: false,
        message: {text, error: true},
      }));
    } finally {
      bluetoothBusy.current = false;
    }
  }, []);

  /** 「连接」: the failure reason comes from the wrapper, never a bare 失败. */
  const connectBluetoothDevice = useCallback(async (device: BleDevice) => {
    if (bluetoothBusy.current) {
      return;
    }
    bluetoothBusy.current = true;
    setBluetooth(current => ({
      ...current,
      busyId: device.id,
      message: undefined,
    }));
    try {
      await connectDevice(device.id);
      setBluetooth(current => ({
        ...current,
        connected: {...current.connected, [device.id]: true},
        message: {
          text: `已连接 ${device.name ?? device.id}`,
          error: false,
        },
      }));
    } catch (error) {
      // Computed before the updater for the same Hermes catch-binding reason.
      const text =
        error instanceof BleConnectFailure
          ? error.message
          : `连接失败：未知原因（${messageOf(error)}）`;
      setBluetooth(current => ({
        ...current,
        message: {text, error: true},
      }));
    } finally {
      bluetoothBusy.current = false;
      setBluetooth(current => ({...current, busyId: undefined}));
    }
  }, []);

  const disconnectBluetoothDevice = useCallback(async (device: BleDevice) => {
    if (bluetoothBusy.current) {
      return;
    }
    bluetoothBusy.current = true;
    setBluetooth(current => ({
      ...current,
      busyId: device.id,
      message: undefined,
    }));
    try {
      await disconnectDevice(device.id);
      setBluetooth(current => {
        const connected = {...current.connected};
        delete connected[device.id];
        return {
          ...current,
          connected,
          message: {
            text: `已断开 ${device.name ?? device.id}`,
            error: false,
          },
        };
      });
    } catch (error) {
      setBluetooth(current => ({
        ...current,
        message: {text: messageOf(error), error: true},
      }));
    } finally {
      bluetoothBusy.current = false;
      setBluetooth(current => ({...current, busyId: undefined}));
    }
  }, []);

  // Leaving the page stops the scan; the native client is kept so the
  // permission dialog does not reappear on the next visit.
  useEffect(() => {
    return () => {
      bluetoothScanning.current = false;
      stopScan().catch(() => {});
    };
  }, []);

  // A link the platform dropped (peripheral gone, Bluetooth switched off) has
  // to flip the row back to 连接 instead of showing a stale 断开.
  useEffect(() => {
    return onDeviceDisconnected(deviceId => {
      setBluetooth(current => {
        if (current.connected[deviceId] !== true) {
          return current;
        }
        const connected = {...current.connected};
        delete connected[deviceId];
        return {
          ...current,
          connected,
          message: {text: `设备 ${deviceId} 已断开`, error: true},
        };
      });
    });
  }, []);

  /**
   * 「扫描」: asks for the approximate-location permission (the one user_grant
   * permission on this path), then reads the native scan payload. The empty
   * list is never reported as "附近没有 WiFi" on its own: Wi-Fi off, location
   * off and an actual empty scan are three different sentences.
   */
  const scanWifiAccessPoints = useCallback(async () => {
    if (wifiBusy.current) {
      return;
    }
    wifiBusy.current = true;
    setWifi(current => ({
      ...current,
      scanning: true,
      message: undefined,
      passwordTarget: undefined,
      password: '',
    }));
    let permissionNote = '';
    try {
      const permission = await requestWifiScanPermission();
      if (permission !== 'granted') {
        permissionNote =
          '（定位权限未授予：如果列表为空，请到「动态权限」的位置行申请）';
      }
    } catch (error) {
      // A refusal here is not fatal for the read; the scan payload says what
      // the platform actually answered. Keep the reason for an empty result.
      permissionNote = `（${messageOf(error)}）`;
    }
    try {
      const result = await scanWifi();
      const message = wifiScanMessage(result, permissionNote);
      setWifi(current => ({
        ...current,
        scanning: false,
        scanned: true,
        // With the location switch off the native list is the system's cache,
        // not a scan the page may present as current; clear it and show the
        // 定位 instruction instead.
        accessPoints: result.locationEnabled ? result.accessPoints : [],
        message,
      }));
    } catch (error) {
      const text = messageOf(error);
      setWifi(current => ({
        ...current,
        scanning: false,
        scanned: true,
        accessPoints: [],
        message: {text: `扫描失败：${text}`, error: true},
      }));
    } finally {
      wifiBusy.current = false;
    }
  }, []);

  /** 「当前 SSID」: a fresh read; a refusal is 未知, never a made-up name. */
  const showCurrentWifiSsid = useCallback(async () => {
    if (wifiSsidBusy.current) {
      return;
    }
    wifiSsidBusy.current = true;
    try {
      const result = await readCurrentSsid();
      setWifi(current => ({
        ...current,
        message: result.known
          ? {
              text: `当前 SSID：${
                result.ssid.length === 0 ? '未连接 Wi-Fi' : result.ssid
              }`,
              error: false,
            }
          : {
              text: `读取当前 SSID 失败：${
                result.reason.length === 0 ? '平台没有说明原因' : result.reason
              }`,
              error: true,
            },
      }));
    } catch (error) {
      const text = messageOf(error);
      setWifi(current => ({
        ...current,
        message: {text, error: true},
      }));
    } finally {
      wifiSsidBusy.current = false;
    }
  }, []);

  /**
   * 「连接」on one AP. A secured AP asks for its password first; the connect
   * itself goes through the candidate route and reports 已连接 / 已取消 /
   * 失败（具体原因）.
   */
  const connectWifiAccessPoint = useCallback(
    async (accessPoint: WifiAccessPoint, password: string) => {
      if (wifiBusy.current) {
        return;
      }
      wifiBusy.current = true;
      setWifi(current => ({
        ...current,
        busySsid: accessPoint.ssid,
        passwordTarget: undefined,
        password: '',
        message: undefined,
      }));
      try {
        const result = await connectWifi(accessPoint, password);
        if (result.outcome === 'connected') {
          setWifi(current => ({
            ...current,
            connectedSsid: accessPoint.ssid,
            message: {text: `已连接：${accessPoint.ssid}`, error: false},
          }));
        } else if (result.outcome === 'userDeclined') {
          setWifi(current => ({
            ...current,
            connectedSsid: undefined,
            message: {
              text: `已取消连接：${accessPoint.ssid}（系统确认框被取消）`,
              error: false,
            },
          }));
        } else {
          setWifi(current => ({
            ...current,
            message: {
              text: `连接失败：${result.reason}`,
              error: true,
            },
          }));
        }
      } catch (error) {
        const text = messageOf(error);
        setWifi(current => ({
          ...current,
          message: {text, error: true},
        }));
      } finally {
        wifiBusy.current = false;
        setWifi(current => ({...current, busySsid: undefined}));
      }
    },
    [],
  );

  const askWifiPassword = useCallback((accessPoint: WifiAccessPoint) => {
    setWifi(current => ({
      ...current,
      passwordTarget: accessPoint,
      password: '',
      message: undefined,
    }));
  }, []);

  const connectWifiFromRow = useCallback(
    (accessPoint: WifiAccessPoint) => {
      if (accessPoint.secured) {
        askWifiPassword(accessPoint);
        return;
      }
      connectWifiAccessPoint(accessPoint, '');
    },
    [askWifiPassword, connectWifiAccessPoint],
  );

  const runAction = useCallback(
    (capability: Capability, action: CapabilityAction) => {
      switch (action) {
        case 'local-storage':
          storageRoundTrip(capability.id);
          return;
        case 'open-url':
          openLink(capability.id);
          return;
        case 'clipboard':
          clipboardRoundTrip(capability.id);
          return;
        case 'save-image':
          saveDemoImage(capability.id);
          return;
        case 'device-info':
          readDevice(capability.id);
          return;
        case 'network-status':
          probeNetwork(capability.id);
          return;
        case 'directories':
          loadDirectories(true);
          return;
        case 'pick-image':
          pickImage(capability.id);
          return;
        case 'decode-image':
          decodePickedImage(capability.id);
          return;
        case 'system-share':
          shareDemoText(capability.id);
          return;
        // The haptics and permission cards render their own bodies, so no
        // single action button ever dispatches these.
        case 'haptics':
        case 'permissions':
        case 'bluetooth-le':
        case 'wifi-network':
          return;
      }
    },
    [
      clipboardRoundTrip,
      decodePickedImage,
      loadDirectories,
      openLink,
      pickImage,
      probeNetwork,
      readDevice,
      saveDemoImage,
      shareDemoText,
      storageRoundTrip,
    ],
  );

  return (
    <View style={styles.screen} testID="capabilities-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={onBack}
          style={({pressed}) => [styles.back, pressed && styles.pressed]}
          testID="capabilities-back">
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.count} testID="capabilities-count">
          共 {CAPABILITIES.length} 项
        </Text>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>平台能力</Text>
        <Text style={styles.subtitle}>
          每行一个能力，点按钮真的调用系统 API，结果显示在行内
        </Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        testID="capabilities-list">
        {CAPABILITIES.map(capability => {
          const outcome = outcomes[capability.id];
          const action = capability.action;
          const interactive =
            capability.status !== 'unimplemented' && action !== undefined;
          return (
            <View
              key={capability.id}
              style={styles.card}
              testID={`capability-row-${capability.id}`}>
              <View style={styles.cardHeader}>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{capability.title}</Text>
                  <Text style={styles.cardDetail}>{capability.detail}</Text>
                </View>
                <Text
                  style={[
                    styles.status,
                    capability.status === 'available' && styles.statusAvailable,
                    capability.status === 'limited' && styles.statusLimited,
                    capability.status === 'unimplemented' &&
                      styles.statusMissing,
                  ]}
                  testID={`capability-status-${capability.id}`}>
                  {statusLabel(capability)}
                </Text>
              </View>

              {capability.action === 'directories' ? (
                <DirectoriesBody
                  state={directories}
                  onRefresh={() => loadDirectories(true)}
                  onCopy={copyDirectory}
                />
              ) : capability.action === 'haptics' ? (
                <HapticsBody onPress={triggerHaptic} />
              ) : capability.action === 'permissions' ? (
                <PermissionsBody
                  state={permissions}
                  onQuery={queryPermission}
                  onRequest={askPermission}
                  onSettings={openSettingsForPermission}
                />
              ) : capability.action === 'bluetooth-le' ? (
                <BluetoothBody
                  state={bluetooth}
                  onScan={toggleBluetoothScan}
                  onConnect={connectBluetoothDevice}
                  onDisconnect={disconnectBluetoothDevice}
                />
              ) : capability.action === 'wifi-network' ? (
                <WifiBody
                  state={wifi}
                  onScan={scanWifiAccessPoints}
                  onCurrentSsid={showCurrentWifiSsid}
                  onConnect={connectWifiFromRow}
                  onPasswordChange={text =>
                    setWifi(current => ({...current, password: text}))
                  }
                  onPasswordConfirm={() => {
                    const target = wifi.passwordTarget;
                    if (target !== undefined) {
                      connectWifiAccessPoint(target, wifi.password);
                    }
                  }}
                  onPasswordCancel={() =>
                    setWifi(current => ({
                      ...current,
                      passwordTarget: undefined,
                      password: '',
                    }))
                  }
                />
              ) : interactive ? (
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      capability.actionLabel ?? capability.title
                    }
                    onPress={() => runAction(capability, action)}
                    style={({pressed}) => [
                      styles.actionButton,
                      pressed && styles.pressed,
                    ]}
                    testID={`capability-action-${capability.id}`}>
                    <Text style={styles.actionText}>
                      {capability.actionLabel}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                // No button at all: a disabled or dead button is what the
                // ticket forbids, so the reason takes the button's place.
                <Text
                  style={styles.unimplemented}
                  testID={`capability-note-${capability.id}`}>
                  {UNIMPLEMENTED_NOTE}
                </Text>
              )}

              {capability.limitation === undefined ? null : (
                <Text
                  style={styles.limitation}
                  testID={`capability-limitation-${capability.id}`}>
                  {capability.limitation}
                </Text>
              )}

              {outcome === undefined ? null : (
                <View style={styles.resultBlock}>
                  <Text
                    style={[
                      styles.result,
                      outcome.kind === 'busy' && styles.resultBusy,
                      outcome.kind === 'error' && styles.resultError,
                    ]}
                    testID={`capability-result-${capability.id}`}>
                    {outcome.kind === 'busy' ? '调用中…' : outcome.text}
                  </Text>
                  {outcome.kind === 'denied' &&
                  capability.id === 'image-save' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="打开相册写入权限设置"
                      onPress={() => openSaveImageSettings(capability.id)}
                      style={({pressed}) => [
                        styles.resultSettings,
                        pressed && styles.pressed,
                      ]}
                      testID={`capability-settings-${capability.id}`}>
                      <Text style={styles.resultSettingsText}>去设置</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 8,
    paddingEnd: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  back: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
  },
  count: {
    marginLeft: 'auto',
    color: colors.textHint,
    fontSize: 12,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {
    alignSelf: 'flex-start',
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    alignSelf: 'flex-start',
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 24,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
    paddingRight: 8,
  },
  cardTitle: {
    alignSelf: 'flex-start',
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  cardDetail: {
    alignSelf: 'flex-start',
    marginTop: 2,
    color: colors.textHint,
    fontSize: 11,
    lineHeight: 18,
  },
  status: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '700',
  },
  statusAvailable: {
    borderColor: colors.discount,
    color: colors.discount,
  },
  statusLimited: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  statusMissing: {
    borderColor: colors.textFaint,
    color: colors.textHint,
  },
  directories: {
    marginTop: 8,
  },
  directoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  directoriesCount: {
    color: colors.textHint,
    fontSize: 12,
  },
  directoryRefresh: {
    marginLeft: 'auto',
    minHeight: 34,
    minWidth: 52,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directoryRefreshDisabled: {
    opacity: 0.5,
  },
  directoryRefreshText: {
    color: colors.accent,
    fontSize: 12,
  },
  directoryMessage: {
    marginTop: 6,
    color: colors.delete,
    fontSize: 12,
    lineHeight: 18,
  },
  directoriesHint: {
    marginTop: 6,
    color: colors.textHint,
    fontSize: 12,
    lineHeight: 18,
  },
  directoryRow: {
    paddingVertical: 6,
  },
  directoryRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  directoryLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  directoryExists: {
    marginEnd: 4,
    fontSize: 10,
    fontWeight: '700',
  },
  directoryExistsYes: {
    color: colors.discount,
  },
  directoryExistsNo: {
    color: colors.delete,
  },
  directoryCopyButton: {
    minHeight: 34,
    minWidth: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directoryCopyText: {
    color: colors.accent,
    fontSize: 11,
  },
  directoryPath: {
    marginTop: 1,
    color: colors.textBody,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  directoryNote: {
    marginTop: 2,
    color: colors.textHint,
    fontSize: 10,
    lineHeight: 16,
  },
  directoryCopied: {
    marginTop: 2,
    color: colors.discount,
    fontSize: 10,
  },
  hapticsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hapticButton: {
    minHeight: 38,
    minWidth: 64,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 19,
    backgroundColor: colors.accent,
  },
  hapticText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
  permissions: {
    marginTop: 6,
  },
  permissionNote: {
    color: colors.textHint,
    fontSize: 11,
    lineHeight: 17,
    paddingBottom: 2,
  },
  permissionRow: {
    paddingVertical: 7,
  },
  permissionRowDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  permissionChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '700',
  },
  permissionChipGranted: {
    borderColor: colors.discount,
    color: colors.discount,
  },
  permissionChipDenied: {
    borderColor: colors.delete,
    color: colors.delete,
  },
  permissionChipUnknown: {
    borderColor: colors.textHint,
    color: colors.textHint,
  },
  permissionButtons: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  permissionTextButton: {
    minHeight: 34,
    minWidth: 52,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionTextButtonText: {
    color: colors.accent,
    fontSize: 12,
  },
  permissionRequestButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 17,
    backgroundColor: colors.accent,
  },
  permissionRequestText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '500',
  },
  permissionButtonDisabled: {
    opacity: 0.5,
  },
  permissionAdvice: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
  },
  permissionMessage: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
  },
  permissionMessageError: {
    color: colors.delete,
  },
  permissionUnavailable: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  wifi: {
    marginTop: 8,
  },
  wifiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wifiCount: {
    flex: 1,
    color: colors.textHint,
    fontSize: 12,
  },
  wifiScanButton: {
    minHeight: 38,
    minWidth: 64,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 19,
    backgroundColor: colors.accent,
  },
  wifiScanDisabled: {
    opacity: 0.5,
  },
  wifiScanText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
  wifiCurrentButton: {
    marginLeft: 4,
    minHeight: 38,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wifiCurrentText: {
    color: colors.accent,
    fontSize: 12,
  },
  wifiNote: {
    marginTop: 4,
    color: colors.textHint,
    fontSize: 10,
    lineHeight: 16,
  },
  wifiMessage: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  wifiMessageError: {
    color: colors.delete,
  },
  wifiHint: {
    marginTop: 6,
    color: colors.textHint,
    fontSize: 12,
    lineHeight: 18,
  },
  wifiPasswordPanel: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  wifiPasswordTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  wifiPasswordInput: {
    marginTop: 6,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 13,
  },
  wifiPasswordActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  wifiPasswordConfirm: {
    minHeight: 34,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  wifiPasswordConfirmText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '500',
  },
  wifiPasswordCancel: {
    minHeight: 34,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  wifiPasswordCancelText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  wifiList: {
    marginTop: 6,
    maxHeight: 220,
  },
  wifiRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  wifiRowText: {
    flex: 1,
    paddingRight: 8,
  },
  wifiSsid: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  wifiSsidConnected: {
    color: colors.discount,
  },
  wifiMeta: {
    marginTop: 1,
    color: colors.textHint,
    fontSize: 10,
    lineHeight: 16,
  },
  wifiConnectButton: {
    minHeight: 32,
    minWidth: 64,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  wifiConnectedButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.discount,
  },
  wifiConnectText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '500',
  },
  wifiConnectedText: {
    color: colors.discount,
  },
  bluetooth: {
    marginTop: 8,
  },
  bluetoothHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bluetoothCount: {
    flex: 1,
    color: colors.textHint,
    fontSize: 12,
  },
  bluetoothScanButton: {
    minHeight: 38,
    minWidth: 72,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 19,
    backgroundColor: colors.accent,
  },
  bluetoothScanStop: {
    backgroundColor: colors.textSecondary,
  },
  bluetoothScanText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
  bluetoothNote: {
    marginTop: 4,
    color: colors.textHint,
    fontSize: 10,
    lineHeight: 16,
  },
  bluetoothMessage: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  bluetoothMessageError: {
    color: colors.delete,
  },
  bluetoothHint: {
    marginTop: 6,
    color: colors.textHint,
    fontSize: 12,
    lineHeight: 18,
  },
  bluetoothList: {
    marginTop: 6,
    maxHeight: 240,
  },
  bluetoothRow: {
    height: BLUETOOTH_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bluetoothRowText: {
    flex: 1,
    paddingRight: 8,
  },
  bluetoothName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  bluetoothAddress: {
    marginTop: 1,
    color: colors.textHint,
    fontSize: 10,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  bluetoothConnectButton: {
    minHeight: 32,
    minWidth: 64,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  bluetoothDisconnectButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  bluetoothConnectDisabled: {
    opacity: 0.5,
  },
  bluetoothConnectText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  bluetoothDisconnectText: {
    color: colors.accent,
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 19,
    backgroundColor: colors.accent,
  },
  actionText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 20,
  },
  unimplemented: {
    marginTop: 10,
    color: colors.textHint,
    fontSize: 12,
    lineHeight: 18,
  },
  limitation: {
    marginTop: 8,
    color: colors.accent,
    fontSize: 11,
    lineHeight: 17,
  },
  result: {
    marginTop: 8,
    color: colors.textBody,
    fontSize: 13,
    lineHeight: 20,
  },
  resultBusy: {
    color: colors.textSecondary,
  },
  resultError: {
    color: colors.delete,
  },
  resultBlock: {
    alignItems: 'flex-start',
  },
  resultSettings: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  resultSettingsText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});

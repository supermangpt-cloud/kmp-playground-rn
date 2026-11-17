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
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {
  CAPABILITIES,
  Capability,
  CapabilityAction,
  UNIMPLEMENTED_NOTE,
} from '../data/capabilities';
import {DIRECTORY_LABELS} from '../data/directories';
import {getItem, removeItem, setItem} from '../native/asyncStorage';
import {
  getString as readClipboard,
  setString as writeClipboard,
} from '../native/clipboard';
import {readDeviceInfo} from '../native/deviceInfo';
import {HapticStrength, vibrate} from '../native/haptics';
import {launchImageLibrary} from '../native/imagePicker';
import {NetworkStatus, readNetworkStatus} from '../native/networkStatus';
import {
  openPermissionSettings,
  PERMISSION_PLATFORM_NOTE,
  PERMISSIONS,
  permissionAdvice,
  permissionStateLabel,
  PermissionId,
  PermissionState,
  readPermissionState,
  requestPermission,
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
import {decodeQrFromBase64} from '../qr/imageDecode';
import {colors} from '../ui/theme';

type Props = {
  onBack: () => void;
};

/** What a row prints under its header after its button ran. */
type RowOutcome =
  | {kind: 'busy'}
  | {kind: 'done'; text: string}
  | {kind: 'error'; text: string};

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

/** How the 网络状态 row prints one reading; `unknown` is not guessed. */
function networkText(status: NetworkStatus): string {
  const connection = status.connected ? '已联网' : '未联网';
  const type = status.type === 'unknown' ? '未知' : status.type;
  return `${connection} · ${type}`;
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

export default function CapabilitiesScreen({onBack}: Props): JSX.Element {
  const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({});
  const [directories, setDirectories] = useState<DirectoriesState>({
    status: 'loading',
    rows: [],
  });
  const [permissions, setPermissions] = useState<PermissionsState>({});
  // The picker is modal and the button stays mounted while it is open; a ref
  // stops a second press from opening a second picker behind the first.
  const busy = useRef(false);
  // The directory card's 刷新 and its first automatic read share this guard, so
  // the permission request cannot be started twice.
  const readingDirectories = useRef(false);
  // Each permission row keeps its own guard, so asking for one permission does
  // not block another row's 查询.
  const permissionBusy = useRef<Record<string, boolean>>({});

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
      setDirectories(current => ({
        ...current,
        status: 'error',
        message: `读取失败：${messageOf(error)}`,
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
                <Text
                  style={[
                    styles.result,
                    outcome.kind === 'busy' && styles.resultBusy,
                    outcome.kind === 'error' && styles.resultError,
                  ]}
                  testID={`capability-result-${capability.id}`}>
                  {outcome.kind === 'busy' ? '调用中…' : outcome.text}
                </Text>
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
  pressed: {
    opacity: 0.7,
  },
});

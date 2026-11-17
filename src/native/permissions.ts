/**
 * JS side of the app's `CapabilityProbe` permission methods, and the eight rows
 * of the 动态权限 card.
 *
 * The states are the same three on every platform: `granted`, `denied` and
 * `notDetermined`. What differs is the catalog behind the rows: on HarmonyOS
 * the album and contacts reads are `system_basic` ACL permissions a normal app
 * cannot hold, while on Android and iOS both are ordinary runtime permissions.
 * `permissionCatalog.ts` / `permissionCatalog.harmony.ts` carry that split, so
 * this file only formats states and talks to the native module.
 */
import {
  PERMISSION_DENIED_ADVICE,
  PERMISSIONS,
  PERMISSION_PLATFORM_NOTE,
} from './permissionCatalog';
import {getTurboModule} from './turboModule';

export {PERMISSIONS, PERMISSION_PLATFORM_NOTE};

/** The eight permissions of the KMP card, in its order. */
export type PermissionId =
  | 'camera'
  | 'microphone'
  | 'location'
  | 'notifications'
  | 'calendar'
  | 'bluetooth'
  | 'photo_library'
  | 'contacts';

/** What one permission row can show; `notDetermined` means "not asked yet". */
export type PermissionState = 'granted' | 'denied' | 'notDetermined';

export type PermissionDefinition = {
  id: PermissionId;
  label: string;
  /** Why this platform cannot offer the permission at all; absent when it can. */
  unavailableReason?: string;
};

/** The chip word for a row; no state means the row was never queried. */
export function permissionStateLabel(state?: PermissionState): string {
  switch (state) {
    case 'granted':
      return '已授权';
    case 'denied':
      return '已拒绝';
    case 'notDetermined':
      return '未询问';
    default:
      return '未查询';
  }
}

/**
 * The line under a row's buttons.
 *
 * A denied row always points at 去设置: every platform stops showing its dialog
 * after a denial (HarmonyOS and iOS immediately, Android after two refusals),
 * so the advice comes from the platform catalog.
 */
export function permissionAdvice(state?: PermissionState): string {
  switch (state) {
    case 'granted':
      return '已授权，可以直接使用';
    case 'denied':
      return PERMISSION_DENIED_ADVICE;
    case 'notDetermined':
      return '还没问过，点「申请」';
    default:
      return '点「查询」读取当前状态，或直接点「申请」';
  }
}

/** Whether a row should offer 去设置 for this state. */
export function showsPermissionSettings(state?: PermissionState): boolean {
  return state === 'denied';
}

type NativePermissions = {
  readPermissionState: (permission: string) => Promise<unknown>;
  requestPermission: (permission: string) => Promise<unknown>;
  openPermissionSettings: (permission: string) => Promise<unknown>;
};

function definitionOf(id: PermissionId): PermissionDefinition {
  const found = PERMISSIONS.find(permission => permission.id === id);
  if (found === undefined) {
    throw new Error(`未知的权限：${id}`);
  }
  return found;
}

function requireProbe(): NativePermissions {
  const module = getTurboModule<NativePermissions>('CapabilityProbe');
  if (
    module === null ||
    typeof module.readPermissionState !== 'function' ||
    typeof module.requestPermission !== 'function' ||
    typeof module.openPermissionSettings !== 'function'
  ) {
    throw new Error('CapabilityProbe 模块没有注册（权限方法不存在）');
  }
  return module;
}

function reasonOf(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const {message, code} = error as {message?: unknown; code?: unknown};
    if (typeof message === 'string' && message.length > 0) {
      return code === undefined
        ? message
        : `${message}（code ${String(code)}）`;
    }
  }
  return fallback;
}

function asState(value: unknown, fallback: string): PermissionState {
  if (value === 'granted' || value === 'denied' || value === 'notDetermined') {
    return value;
  }
  throw new Error(`${fallback}返回了无法识别的状态：${String(value)}`);
}

function unavailableReasonFor(id: PermissionId): string | undefined {
  return definitionOf(id).unavailableReason;
}

/** Reads one permission's state without showing any dialog. */
export async function readPermissionState(
  id: PermissionId,
): Promise<PermissionState> {
  const reason = unavailableReasonFor(id);
  if (reason !== undefined) {
    throw new Error(`不可用的权限：${reason}`);
  }
  let value: unknown;
  try {
    value = await requireProbe().readPermissionState(id);
  } catch (error) {
    throw new Error(reasonOf(error, '查询权限状态失败'));
  }
  return asState(value, '查询权限状态');
}

/** Shows the system dialog for one permission and returns the new state. */
export async function requestPermission(
  id: PermissionId,
): Promise<PermissionState> {
  const reason = unavailableReasonFor(id);
  if (reason !== undefined) {
    throw new Error(`不可用的权限：${reason}`);
  }
  let value: unknown;
  try {
    value = await requireProbe().requestPermission(id);
  } catch (error) {
    throw new Error(reasonOf(error, '申请权限失败'));
  }
  return asState(value, '申请权限');
}

/** Opens the system page where a denied permission can be re-enabled. */
export async function openPermissionSettings(id: PermissionId): Promise<void> {
  const reason = unavailableReasonFor(id);
  if (reason !== undefined) {
    throw new Error(`不可用的权限：${reason}`);
  }
  try {
    await requireProbe().openPermissionSettings(id);
  } catch (error) {
    throw new Error(reasonOf(error, '打开权限设置失败'));
  }
}

/**
 * Requests the one user_grant permission on the WiFi scan path.
 *
 * It is `APPROXIMATELY_LOCATION` only: the API reference for the deprecated
 * active-scan call names precise LOCATION too, but the scan-list read this page
 * uses does not, and asking for precise location would be more than the card
 * needs. The permission is declared in module.json5 next to the 动态权限 card's
 * location row; a denial is returned as a state, not an exception, so the card
 * can still try the scan and report an empty list honestly.
 */
export async function requestWifiScanPermission(): Promise<PermissionState> {
  let value: unknown;
  try {
    value = await requireProbe().requestPermission('wifi_scan');
  } catch (error) {
    throw new Error(reasonOf(error, '申请 WiFi 扫描所需的定位权限失败'));
  }
  return asState(value, '申请 WiFi 扫描所需的定位权限');
}

/**
 * The permission behind 保存图片到相册 (`WRITE_IMAGEVIDEO`).
 *
 * It is not one of the eight rows: that card's 相册 row is about reading the
 * album (`READ_IMAGEVIDEO`), which is still unavailable. Writing one image the
 * app generated goes through the ACL-enabled `WRITE_IMAGEVIDEO`, whose denial
 * needs the same 去设置 second step as a normal permission, so the save flow
 * reuses the native `openPermissionSettings` call with this internal id.
 */
const ALBUM_WRITE_PERMISSION_ID = 'photo_write';

/** Opens the system page for the album-write permission after a denial. */
export async function openAlbumWritePermissionSettings(): Promise<void> {
  try {
    await requireProbe().openPermissionSettings(ALBUM_WRITE_PERMISSION_ID);
  } catch (error) {
    throw new Error(reasonOf(error, '打开相册写入权限设置失败'));
  }
}

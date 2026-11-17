/**
 * JS side of the app's `CapabilityProbe` permission methods, and the eight rows
 * of the 动态权限 card.
 *
 * The states are the same three the KMP build maps HarmonyOS into: `granted`,
 * `denied` and `notDetermined` (HarmonyOS has no separate "permanently denied"
 * result, and its first-run dialog is not shown again after a denial — which is
 * why a denied row offers 去设置 instead of a second 申请).
 *
 * The album and contacts rows never reach the native side: on HarmonyOS
 * `READ_IMAGEVIDEO` / `READ_CONTACTS` are `system_basic` ACL restricted
 * permissions that a normal app cannot be granted, so the row states that and
 * names the sanctioned Picker alternative instead of offering a button that
 * could only fail.
 */
import {getTurboModule} from './turboModule';

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

/** The ACL reason from the HarmonyOS permission definitions, in full. */
export const PHOTO_LIBRARY_REASON =
  'READ_IMAGEVIDEO 是 ACL 受限权限（system_basic）：可在 AGC 按场景申请，但只对相册整理、批量读取这类场景开放且需审核；普通场景官方推荐用 PhotoViewPicker（无需任何权限）';
export const CONTACTS_REASON =
  'READ_CONTACTS 是 ACL 受限权限（system_basic）：可在 AGC 按场景申请，但只对通讯录同步、云端备份这类场景开放且需审核；普通场景官方推荐用联系人 Picker（无需任何权限）';

/** The sentence the card prints above its rows, as the KMP page does. */
export const PERMISSION_PLATFORM_NOTE =
  '鸿蒙没有「永久拒绝」状态：拒绝后系统不会再次弹框，请点「去设置」在权限设置里打开。相册和通讯录是 system_basic，普通应用无法申请。';

export const PERMISSIONS: readonly PermissionDefinition[] = [
  {id: 'camera', label: '相机'},
  {id: 'microphone', label: '麦克风'},
  {id: 'location', label: '位置'},
  {id: 'notifications', label: '通知'},
  {id: 'calendar', label: '日历'},
  {id: 'bluetooth', label: '蓝牙'},
  {id: 'photo_library', label: '相册', unavailableReason: PHOTO_LIBRARY_REASON},
  {id: 'contacts', label: '通讯录', unavailableReason: CONTACTS_REASON},
];

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
 * HarmonyOS does not show its first-run dialog again after a denial, so a
 * denied row always points at 去设置; there is no "denied permanently" state to
 * distinguish it from.
 */
export function permissionAdvice(state?: PermissionState): string {
  switch (state) {
    case 'granted':
      return '已授权，可以直接使用';
    case 'denied':
      return '被拒绝了；这个平台不会再弹框，点「去设置」在系统设置里打开';
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

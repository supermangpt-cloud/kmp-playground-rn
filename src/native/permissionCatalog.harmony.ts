/**
 * The eight permission rows on HarmonyOS.
 *
 * Four are normal `user_grant` permissions with a first-run dialog. The album
 * read and the contacts read are `system_basic` ACL-restricted permissions a
 * normal app cannot be granted, so those two rows state that and name the
 * sanctioned Picker alternative instead of offering a button that could only
 * fail. Notifications are not a permission here; the notification manager's
 * switch is the state.
 *
 * HarmonyOS has no separate "permanently denied" state: after a denial the
 * first-run dialog is not shown again, which is why every denied row shows
 * 去设置.
 */
import type {PermissionDefinition} from './permissions';

/** The ACL reason from the HarmonyOS permission definitions, in full. */
export const PHOTO_LIBRARY_REASON =
  'READ_IMAGEVIDEO 是 ACL 受限权限（system_basic）：可在 AGC 按场景申请，但只对相册整理、批量读取这类场景开放且需审核；普通场景官方推荐用 PhotoViewPicker（无需任何权限）';
export const CONTACTS_REASON =
  'READ_CONTACTS 是 ACL 受限权限（system_basic）：可在 AGC 按场景申请，但只对通讯录同步、云端备份这类场景开放且需审核；普通场景官方推荐用联系人 Picker（无需任何权限）';

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

export const PERMISSION_PLATFORM_NOTE =
  '鸿蒙没有「永久拒绝」状态：拒绝后系统不会再次弹框，请点「去设置」在权限设置里打开。相册和通讯录是 system_basic，普通应用无法申请。';

export const PERMISSION_DENIED_ADVICE =
  '被拒绝了；这个平台不会再弹框，点「去设置」在系统设置里打开';

/**
 * The eight permission rows on Android and iOS.
 *
 * Unlike HarmonyOS, neither platform ACL-restricts the album read or the
 * contacts read for a normal app: both show a runtime dialog (Android 13+
 * `READ_MEDIA_IMAGES`, otherwise `READ_EXTERNAL_STORAGE`; iOS
 * `NSPhotoLibraryUsageDescription`), so every row offers 查询 / 申请 here.
 *
 * The three permission states keep the same meaning as on HarmonyOS, but the
 * "denied" advice differs: both mobile platforms stop showing the dialog after
 * a denial (iOS after the first, Android after two), which is why a denied row
 * points at 去设置.
 *
 * Metro picks `permissionCatalog.harmony.ts` on HarmonyOS.
 */
import {Platform} from 'react-native';

import type {PermissionDefinition} from './permissions';

const IS_IOS = Platform.OS === 'ios';

export const PERMISSIONS: readonly PermissionDefinition[] = [
  {id: 'camera', label: '相机'},
  {id: 'microphone', label: '麦克风'},
  {id: 'location', label: '位置'},
  {id: 'notifications', label: '通知'},
  {id: 'calendar', label: '日历'},
  {id: 'bluetooth', label: '蓝牙'},
  {id: 'photo_library', label: '相册'},
  {id: 'contacts', label: '通讯录'},
];

export const PERMISSION_PLATFORM_NOTE = IS_IOS
  ? 'iOS 的权限被拒绝后系统不会再弹框，请点「去设置」在系统设置里打开。相册读取和通讯录都需要在系统设置里授权。'
  : 'Android 的权限在拒绝两次后系统不再弹框，请点「去设置」在应用权限里打开。相册读取和通讯录都需要运行时授权。';

export const PERMISSION_DENIED_ADVICE = IS_IOS
  ? '被拒绝了；iOS 不会再弹框，点「去设置」在系统设置里打开'
  : '被拒绝了；Android 拒绝两次后不再弹框，点「去设置」在系统设置里打开';

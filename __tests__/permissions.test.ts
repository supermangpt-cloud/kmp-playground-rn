/**
 * The JS face of the app's `CapabilityProbe` permission methods and the eight
 * rows of the 动态权限 card: the state mapping, the ACL rows that never reach
 * the platform, the 去设置 advice and the wrapper error messages. The device run
 * is what proves @ohos.abilityAccessCtrl and the settings dialogs.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {
  openPermissionSettings,
  PERMISSION_PLATFORM_NOTE,
  PERMISSIONS,
  permissionAdvice,
  permissionStateLabel,
  readPermissionState,
  requestPermission,
  showsPermissionSettings,
} from '../src/native/permissions';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

type Probe = {
  readPermissionState: jest.Mock<(permission: string) => Promise<unknown>>;
  requestPermission: jest.Mock<(permission: string) => Promise<unknown>>;
  openPermissionSettings: jest.Mock<(permission: string) => Promise<unknown>>;
};

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
};

function fakeProbe(): Probe {
  return {
    readPermissionState: jest.fn(),
    requestPermission: jest.fn(),
    openPermissionSettings: jest.fn(),
  };
}

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeProbe());
});

it('lists the eight KMP permissions in the KMP order', () => {
  expect(PERMISSIONS.map(permission => permission.id)).toEqual([
    'camera',
    'microphone',
    'location',
    'notifications',
    'calendar',
    'bluetooth',
    'photo_library',
    'contacts',
  ]);
  expect(PERMISSIONS.map(permission => permission.label)).toEqual([
    '相机',
    '麦克风',
    '位置',
    '通知',
    '日历',
    '蓝牙',
    '相册',
    '通讯录',
  ]);
});

it('marks the two system_basic rows unavailable with the ACL reason', () => {
  const unavailable = PERMISSIONS.filter(
    permission => permission.unavailableReason !== undefined,
  );

  expect(unavailable.map(permission => permission.id)).toEqual([
    'photo_library',
    'contacts',
  ]);
  for (const permission of unavailable) {
    expect(permission.unavailableReason).toContain('ACL 受限权限');
    expect(permission.unavailableReason).toContain('system_basic');
  }
});

it('prints the platform note the KMP card shows', () => {
  expect(PERMISSION_PLATFORM_NOTE).toContain('鸿蒙没有「永久拒绝」状态');
  expect(PERMISSION_PLATFORM_NOTE).toContain('去设置');
  expect(PERMISSION_PLATFORM_NOTE).toContain('system_basic');
});

it('maps the three HarmonyOS states into labels and advice', () => {
  expect(permissionStateLabel(undefined)).toBe('未查询');
  expect(permissionStateLabel('notDetermined')).toBe('未询问');
  expect(permissionStateLabel('granted')).toBe('已授权');
  expect(permissionStateLabel('denied')).toBe('已拒绝');

  expect(permissionAdvice(undefined)).toBe(
    '点「查询」读取当前状态，或直接点「申请」',
  );
  expect(permissionAdvice('notDetermined')).toBe('还没问过，点「申请」');
  expect(permissionAdvice('granted')).toBe('已授权，可以直接使用');
  expect(permissionAdvice('denied')).toContain('去设置');

  // HarmonyOS never re-prompts after a denial, so a denied row needs 去设置.
  expect(showsPermissionSettings('denied')).toBe(true);
  expect(showsPermissionSettings('granted')).toBe(false);
  expect(showsPermissionSettings('notDetermined')).toBe(false);
  expect(showsPermissionSettings(undefined)).toBe(false);
});

it('reads one permission state from the native module', async () => {
  const probe = fakeProbe();
  probe.readPermissionState.mockImplementation(() =>
    Promise.resolve('notDetermined'),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readPermissionState('camera')).resolves.toBe('notDetermined');
  expect(probe.readPermissionState).toHaveBeenCalledWith('camera');
});

it('rejects an unrecognised state instead of guessing one', async () => {
  const probe = fakeProbe();
  probe.readPermissionState.mockImplementation(() =>
    Promise.resolve('blocked'),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readPermissionState('camera')).rejects.toThrow(
    '查询权限状态返回了无法识别的状态：blocked',
  );
});

it('never calls the platform for the ACL rows', async () => {
  const probe = fakeProbe();
  mockTurboModule.mockReturnValue(probe);

  await expect(readPermissionState('photo_library')).rejects.toThrow(
    '不可用的权限',
  );
  await expect(requestPermission('contacts')).rejects.toThrow('不可用的权限');
  expect(probe.readPermissionState).not.toHaveBeenCalled();
  expect(probe.requestPermission).not.toHaveBeenCalled();
});

it('asks for a permission and returns the new state', async () => {
  const probe = fakeProbe();
  probe.requestPermission.mockImplementation(() => Promise.resolve('granted'));
  mockTurboModule.mockReturnValue(probe);

  await expect(requestPermission('camera')).resolves.toBe('granted');
  expect(probe.requestPermission).toHaveBeenCalledWith('camera');
});

it('opens the permission settings page for a denied row', async () => {
  const probe = fakeProbe();
  probe.openPermissionSettings.mockImplementation(() => Promise.resolve());
  mockTurboModule.mockReturnValue(probe);

  await expect(openPermissionSettings('calendar')).resolves.toBeUndefined();
  expect(probe.openPermissionSettings).toHaveBeenCalledWith('calendar');
});

it('turns native rejections into the row reason', async () => {
  const probe = fakeProbe();
  probe.requestPermission.mockImplementation(() =>
    Promise.reject({message: 'User refuses authorization', code: 12100001}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(requestPermission('microphone')).rejects.toThrow(
    'User refuses authorization（code 12100001）',
  );
});

it('rejects with a clear reason when the module is not registered', async () => {
  mockTurboModule.mockReturnValue(null);

  await expect(readPermissionState('camera')).rejects.toThrow(
    'CapabilityProbe 模块没有注册（权限方法不存在）',
  );
});

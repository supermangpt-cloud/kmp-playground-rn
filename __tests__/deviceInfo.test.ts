/**
 * The JS face of the app's `CapabilityProbe` device-information method: the real
 * field mapping, the missing-module error and the "incomplete payload" guard.
 * The device run is what proves `@ohos.deviceInfo` and `bundleManager`.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {readDeviceInfo} from '../src/native/deviceInfo';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

type Probe = {
  readDeviceInfo: jest.Mock<() => Promise<unknown>>;
};

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
};

function fakeProbe(): Probe {
  return {readDeviceInfo: jest.fn()};
}

const REAL_DEVICE = {
  model: 'ALN-AL00',
  systemName: 'HarmonyOS',
  systemVersion: '7.0.0.111(SP10C00E111R4P3)',
  appName: 'KMP RN Demo',
  appVersion: '1.0.0',
};

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeProbe());
});

it('returns the five fields the device reported', async () => {
  const probe = fakeProbe();
  probe.readDeviceInfo.mockImplementation(() => Promise.resolve(REAL_DEVICE));
  mockTurboModule.mockReturnValue(probe);

  await expect(readDeviceInfo()).resolves.toEqual(REAL_DEVICE);
  expect(probe.readDeviceInfo).toHaveBeenCalledTimes(1);
});

it('rejects with a clear reason when the module is not registered', async () => {
  mockTurboModule.mockReturnValue(null);

  await expect(readDeviceInfo()).rejects.toThrow(
    'CapabilityProbe 模块没有注册（readDeviceInfo 不存在）',
  );
});

it('rejects an incomplete payload instead of printing sample values', async () => {
  const probe = fakeProbe();
  probe.readDeviceInfo.mockImplementation(() =>
    Promise.resolve({...REAL_DEVICE, systemVersion: ''}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readDeviceInfo()).rejects.toThrow(
    '设备信息模块返回了不完整的数据',
  );
});

it('turns a native rejection into the row reason', async () => {
  const probe = fakeProbe();
  probe.readDeviceInfo.mockImplementation(() =>
    Promise.reject({message: 'bundle info unavailable', code: 1001}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readDeviceInfo()).rejects.toThrow(
    'bundle info unavailable（code 1001）',
  );
});

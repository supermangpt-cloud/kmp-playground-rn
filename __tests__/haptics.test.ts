/**
 * The JS face of the app's `CapabilityProbe` haptics method: the payload guard,
 * the platform's fallback note and the missing-module/rejection messages. The
 * device run is what proves the vibrator calls and the touch-feedback fallback.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {vibrate} from '../src/native/haptics';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

type Probe = {
  vibrateHaptic: jest.Mock<(strength: string) => Promise<unknown>>;
};

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
};

function fakeProbe(): Probe {
  return {vibrateHaptic: jest.fn()};
}

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeProbe());
});

it('returns fired with no note for the normal path', async () => {
  const probe = fakeProbe();
  probe.vibrateHaptic.mockImplementation(() =>
    Promise.resolve({fired: true, note: ''}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(vibrate('light')).resolves.toEqual({fired: true});
  expect(probe.vibrateHaptic).toHaveBeenCalledWith('light');
});

it('keeps the platform fallback note so the row can explain it', async () => {
  const probe = fakeProbe();
  probe.vibrateHaptic.mockImplementation(() =>
    Promise.resolve({
      fired: true,
      note: '物理反馈被系统触感开关忽略，已用通知场景振动代替',
    }),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(vibrate('heavy')).resolves.toEqual({
    fired: true,
    note: '物理反馈被系统触感开关忽略，已用通知场景振动代替',
  });
});

it('rejects with a clear reason when the module is not registered', async () => {
  mockTurboModule.mockReturnValue(null);

  await expect(vibrate('medium')).rejects.toThrow(
    'CapabilityProbe 模块没有注册（vibrateHaptic 不存在）',
  );
});

it('rejects an unrecognised payload instead of claiming a tap', async () => {
  const probe = fakeProbe();
  probe.vibrateHaptic.mockImplementation(() =>
    Promise.resolve({fired: 'yes', note: ''}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(vibrate('light')).rejects.toThrow(
    '震动模块返回了无法识别的结果',
  );
});

it('refuses a payload that says nothing fired', async () => {
  const probe = fakeProbe();
  probe.vibrateHaptic.mockImplementation(() =>
    Promise.resolve({fired: false, note: ''}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(vibrate('light')).rejects.toThrow('震动没有被系统执行');
});

it('turns a native rejection into the row reason', async () => {
  const probe = fakeProbe();
  probe.vibrateHaptic.mockImplementation(() =>
    Promise.reject({message: 'Device operation failed', code: 14600101}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(vibrate('light')).rejects.toThrow(
    'Device operation failed（code 14600101）',
  );
});

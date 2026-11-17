/**
 * The JS face of the app's `CapabilityProbe` network method: a fresh read per
 * call, the `unknown` transport, and the guards that stop a contradictory
 * payload from becoming a row. The device run proves `@ohos.net.connection`.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {readNetworkStatus} from '../src/native/networkStatus';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

type Probe = {
  readNetworkStatus: jest.Mock<() => Promise<unknown>>;
};

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
};

function fakeProbe(): Probe {
  return {readNetworkStatus: jest.fn()};
}

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeProbe());
});

it('returns the transport the device is using now', async () => {
  const probe = fakeProbe();
  probe.readNetworkStatus.mockImplementation(() =>
    Promise.resolve({connected: true, type: 'wifi'}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readNetworkStatus()).resolves.toEqual({
    connected: true,
    type: 'wifi',
  });
});

it('reads again on the next call instead of caching the first answer', async () => {
  const probe = fakeProbe();
  probe.readNetworkStatus
    .mockImplementationOnce(() =>
      Promise.resolve({connected: true, type: 'wifi'}),
    )
    .mockImplementationOnce(() =>
      Promise.resolve({connected: false, type: 'none'}),
    );
  mockTurboModule.mockReturnValue(probe);

  await expect(readNetworkStatus()).resolves.toEqual({
    connected: true,
    type: 'wifi',
  });
  await expect(readNetworkStatus()).resolves.toEqual({
    connected: false,
    type: 'none',
  });
  expect(probe.readNetworkStatus).toHaveBeenCalledTimes(2);
});

it('keeps an unrecognised transport as unknown rather than guessing', async () => {
  const probe = fakeProbe();
  probe.readNetworkStatus.mockImplementation(() =>
    Promise.resolve({connected: true, type: 'unknown'}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readNetworkStatus()).resolves.toEqual({
    connected: true,
    type: 'unknown',
  });
});

it('rejects a contradictory payload', async () => {
  const probe = fakeProbe();
  probe.readNetworkStatus.mockImplementation(() =>
    Promise.resolve({connected: false, type: 'wifi'}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readNetworkStatus()).rejects.toThrow(
    '网络状态模块返回了矛盾的数据：wifi',
  );
});

it('rejects a payload with no connected flag', async () => {
  const probe = fakeProbe();
  probe.readNetworkStatus.mockImplementation(() =>
    Promise.resolve({type: 'wifi'}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readNetworkStatus()).rejects.toThrow(
    '网络状态模块返回了不完整的数据',
  );
});

it('rejects with a clear reason when the module is not registered', async () => {
  mockTurboModule.mockReturnValue(null);

  await expect(readNetworkStatus()).rejects.toThrow(
    'CapabilityProbe 模块没有注册（readNetworkStatus 不存在）',
  );
});

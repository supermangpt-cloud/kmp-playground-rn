/**
 * The JS face of the HarmonyOS clipboard turbo module. The read path is the one
 * that matters: HarmonyOS refuses it for a normal app once the permission
 * request comes back denied, and the page has to receive a readable reason
 * instead of `[object Object]`.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {getString, setString} from '../src/native/clipboard';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
};

type FakeClipboard = {
  getString: jest.Mock<() => Promise<string>>;
  setString: jest.Mock<(text: string) => void>;
};

function fakeClipboard(): FakeClipboard {
  return {
    getString: jest.fn(),
    setString: jest.fn(),
  };
}

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeClipboard());
});

it('writes through setString and reads through getString', async () => {
  const clipboard = fakeClipboard();
  clipboard.getString.mockImplementation(() => Promise.resolve('demo'));
  mockTurboModule.mockReturnValue(clipboard);

  setString('demo');
  await expect(getString()).resolves.toBe('demo');
  expect(clipboard.setString).toHaveBeenCalledWith('demo');
});

it('turns the module refusal object into an Error message', async () => {
  const clipboard = fakeClipboard();
  clipboard.getString.mockImplementation(() =>
    Promise.reject({code: 0, message: 'User refuses authorization'}),
  );
  mockTurboModule.mockReturnValue(clipboard);

  await expect(getString()).rejects.toThrow(
    'User refuses authorization（code 0）',
  );
});

it('reports a missing module instead of a silent no-op', async () => {
  mockTurboModule.mockReturnValue(null);

  expect(() => setString('demo')).toThrow(
    'Clipboard 模块没有注册（RNCClipboard 不存在）',
  );
  await expect(getString()).rejects.toThrow(
    'Clipboard 模块没有注册（RNCClipboard 不存在）',
  );
});

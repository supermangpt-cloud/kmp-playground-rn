/**
 * The JS face of the HarmonyOS async-storage turbo module: missing keys, module
 * errors and the write/remove call shapes. The device run proves the database;
 * these tests pin the contract the capability page relies on.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {getItem, removeItem, setItem} from '../src/native/asyncStorage';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

type Pair = [string, string];

type FakeStorage = {
  multiGet: jest.Mock<
    (
      keys: string[],
      callback: (error?: unknown, result?: Pair[] | null) => void,
    ) => void
  >;
  multiSet: jest.Mock<
    (pairs: Pair[], callback: (error?: unknown) => void) => void
  >;
  multiRemove: jest.Mock<
    (keys: string[], callback: (error?: unknown) => void) => void
  >;
};

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
  mockImplementation: (impl: (...args: never[]) => unknown) => void;
};

function fakeStorage(): FakeStorage {
  return {
    multiGet: jest.fn(),
    multiSet: jest.fn(),
    multiRemove: jest.fn(),
  };
}

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeStorage());
});

it('resolves a stored value from multiGet', async () => {
  const storage = fakeStorage();
  storage.multiGet.mockImplementation((keys, callback) => {
    callback(null, [['k', 'v']]);
  });
  mockTurboModule.mockReturnValue(storage);

  await expect(getItem('k')).resolves.toBe('v');
  expect(storage.multiGet).toHaveBeenCalledWith(['k'], expect.any(Function));
});

it('turns the HarmonyOS missing-key row into null', async () => {
  const storage = fakeStorage();
  storage.multiGet.mockImplementation((keys, callback) => {
    callback(null, [['k', '']]);
  });
  mockTurboModule.mockReturnValue(storage);

  await expect(getItem('k')).resolves.toBeNull();
});

it('rejects with the module reason when multiGet fails', async () => {
  const storage = fakeStorage();
  storage.multiGet.mockImplementation((keys, callback) => {
    callback({message: 'database is busy', code: 14800011});
  });
  mockTurboModule.mockReturnValue(storage);

  await expect(getItem('k')).rejects.toThrow(
    'database is busy（code 14800011）',
  );
});

it('writes and removes through multiSet/multiRemove', async () => {
  const storage = fakeStorage();
  storage.multiSet.mockImplementation((pairs, callback) => callback());
  storage.multiRemove.mockImplementation((keys, callback) => callback());
  mockTurboModule.mockReturnValue(storage);

  await expect(setItem('k', 'v')).resolves.toBeUndefined();
  await expect(removeItem('k')).resolves.toBeUndefined();
  expect(storage.multiSet).toHaveBeenCalledWith(
    [['k', 'v']],
    expect.any(Function),
  );
  expect(storage.multiRemove).toHaveBeenCalledWith(['k'], expect.any(Function));
});

it('rejects with a clear reason when the module is not registered', async () => {
  mockTurboModule.mockReturnValue(null);

  await expect(getItem('k')).rejects.toThrow(
    'AsyncStorage 模块没有注册（RNCAsyncStorage 没有 multiGet/multiSet）',
  );
});

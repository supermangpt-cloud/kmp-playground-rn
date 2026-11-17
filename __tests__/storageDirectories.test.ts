/**
 * The JS face of the app's `CapabilityProbe` directory method: the seven-row
 * mapping, the static HarmonyOS notes the KMP card shows, the runtime note's
 * precedence and the guards against an invented path. The device run proves
 * `Context` paths, `Environment`'s 801 answer and `fs.accessSync`.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {readDirectories} from '../src/native/storageDirectories';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

type Probe = {
  readDirectories: jest.Mock<(request: boolean) => Promise<unknown>>;
};

type Raw = {
  kind: string;
  path: string;
  exists: boolean;
  note: string;
};

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
};

function fakeProbe(): Probe {
  return {readDirectories: jest.fn()};
}

const RAW: Raw[] = [
  {
    kind: 'Cache',
    path: '/data/storage/el2/base/haps/entry/cache',
    exists: true,
    note: '',
  },
  {
    kind: 'Files',
    path: '/data/storage/el2/base/haps/entry/files',
    exists: true,
    note: '',
  },
  {
    kind: 'Database',
    path: '/data/storage/el2/database/entry',
    exists: true,
    note: '',
  },
  {
    kind: 'Temp',
    path: '/data/storage/el2/base/haps/entry/temp',
    exists: true,
    note: '',
  },
  {
    kind: 'Downloads',
    path: '',
    exists: false,
    note: '当前设备类型不支持公共下载目录（801：仅 PC/2in1 与平板支持）',
  },
  {
    kind: 'Documents',
    path: '',
    exists: false,
    note: '当前设备类型不支持公共文档目录（801：仅 PC/2in1 与平板支持）',
  },
  {kind: 'PhotoAlbum', path: '', exists: false, note: ''},
];

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeProbe());
});

it('maps the seven rows and turns empty strings into absent paths', async () => {
  const probe = fakeProbe();
  probe.readDirectories.mockImplementation(() => Promise.resolve(RAW));
  mockTurboModule.mockReturnValue(probe);

  const rows = await readDirectories(false);

  expect(rows.map(row => row.kind)).toEqual([
    'Cache',
    'Files',
    'Database',
    'Temp',
    'Downloads',
    'Documents',
    'PhotoAlbum',
  ]);
  expect(rows[0].path).toBe('/data/storage/el2/base/haps/entry/cache');
  expect(rows[0].exists).toBe(true);
  expect(rows[0].note).toBeUndefined();
  expect(rows[4].path).toBeUndefined();
  expect(rows[4].exists).toBe(false);
  // The platform's own 801 note wins over the static sandbox explanation.
  expect(rows[4].note).toContain('801');
  // The album has no path, so it gets the photoAccessHelper explanation.
  expect(rows[6].note).toContain('photoAccessHelper');
  expect(probe.readDirectories).toHaveBeenCalledWith(false);
});

it('adds the sandbox note to a public directory the device does support', async () => {
  const probe = fakeProbe();
  probe.readDirectories.mockImplementation(() =>
    Promise.resolve([
      {
        kind: 'Downloads',
        path: '/storage/Users/currentUser/Download',
        exists: true,
        note: '',
      },
      {
        kind: 'Documents',
        path: '/storage/Users/currentUser/Documents',
        exists: true,
        note: '',
      },
    ]),
  );
  mockTurboModule.mockReturnValue(probe);

  const rows = await readDirectories(true);

  expect(rows[0].path).toBe('/storage/Users/currentUser/Download');
  expect(rows[0].note).toBe('公共下载目录的沙箱映射路径');
  expect(rows[1].note).toBe('公共文档目录的沙箱映射路径');
  expect(probe.readDirectories).toHaveBeenCalledWith(true);
});

it('rejects an unknown directory kind instead of showing a blank row', async () => {
  const probe = fakeProbe();
  probe.readDirectories.mockImplementation(() =>
    Promise.resolve([{kind: 'SdCard', path: '/x', exists: true, note: ''}]),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readDirectories(false)).rejects.toThrow(
    '存储目录模块返回了无法识别的目录',
  );
});

it('rejects with a clear reason when the module is not registered', async () => {
  mockTurboModule.mockReturnValue(null);

  await expect(readDirectories(false)).rejects.toThrow(
    'CapabilityProbe 模块没有注册（readDirectories 不存在）',
  );
});

it('turns a native rejection into the card reason', async () => {
  const probe = fakeProbe();
  probe.readDirectories.mockImplementation(() =>
    Promise.reject({message: 'context is unavailable', code: 401}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(readDirectories(false)).rejects.toThrow(
    'context is unavailable（code 401）',
  );
});

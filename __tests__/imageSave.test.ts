/**
 * The JS face of the `ImageSave` module: the structured result, the module
 * missing on non-HarmonyOS builds, and the contract check on the native answer.
 * The device run in `docs/features/qrcode.md` proves the ArkTS side.
 */
import {beforeEach, describe, expect, it, jest} from '@jest/globals';

import {isImageSaveAvailable, savePngToAlbum} from '../src/native/imageSave';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
};

type Native = {
  saveImage: jest.Mock<(base64: string, title: string) => Promise<unknown>>;
};

function fakeModule(): Native {
  return {saveImage: jest.fn()};
}

const PNG_BASE64 = 'iVBORw0KGgo=';

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeModule());
});

describe('savePngToAlbum', () => {
  it('passes the base64 and title to the native module and accepts a save', async () => {
    const module = fakeModule();
    module.saveImage.mockImplementation(() =>
      Promise.resolve({
        saved: true,
        uri: 'file://media/Photo/1/IMG_1/KMP-RN-QR.png',
        title: 'KMP-RN-QR-20261117-180300',
        permissionDenied: false,
        reason: '',
      }),
    );
    mockTurboModule.mockReturnValue(module);

    await expect(
      savePngToAlbum(PNG_BASE64, 'KMP-RN-QR-20261117-180300'),
    ).resolves.toEqual({
      saved: true,
      uri: 'file://media/Photo/1/IMG_1/KMP-RN-QR.png',
      title: 'KMP-RN-QR-20261117-180300',
    });
    expect(module.saveImage).toHaveBeenCalledWith(
      PNG_BASE64,
      'KMP-RN-QR-20261117-180300',
    );
  });

  it('keeps a refusal distinguishable from a platform failure', async () => {
    const module = fakeModule();
    module.saveImage.mockImplementation(() =>
      Promise.resolve({
        saved: false,
        uri: '',
        title: '',
        permissionDenied: true,
        reason: '相册写入权限被拒绝（WRITE_IMAGEVIDEO）',
      }),
    );
    mockTurboModule.mockReturnValue(module);

    await expect(savePngToAlbum(PNG_BASE64, 'title')).resolves.toEqual({
      saved: false,
      permissionDenied: true,
      reason: '相册写入权限被拒绝（WRITE_IMAGEVIDEO）',
    });
  });

  it('returns a platform failure without inventing a permission denial', async () => {
    const module = fakeModule();
    module.saveImage.mockImplementation(() =>
      Promise.resolve({
        saved: false,
        permissionDenied: false,
        reason: '写入相册失败：13900020 Invalid argument',
      }),
    );
    mockTurboModule.mockReturnValue(module);

    await expect(savePngToAlbum(PNG_BASE64, 'title')).resolves.toEqual({
      saved: false,
      permissionDenied: false,
      reason: '写入相册失败：13900020 Invalid argument',
    });
  });

  it('rejects when the module is not registered, naming the platform limit', async () => {
    mockTurboModule.mockReturnValue(null);

    await expect(savePngToAlbum(PNG_BASE64, 'title')).rejects.toThrow(
      'ImageSave 模块没有注册',
    );
  });

  it('rejects an empty PNG before calling the module', async () => {
    const module = fakeModule();
    mockTurboModule.mockReturnValue(module);

    await expect(savePngToAlbum('', 'title')).rejects.toThrow(
      '没有可保存的 PNG 内容',
    );
    expect(module.saveImage).not.toHaveBeenCalled();
  });

  it('rejects an empty title before calling the module', async () => {
    const module = fakeModule();
    mockTurboModule.mockReturnValue(module);

    await expect(savePngToAlbum(PNG_BASE64, '')).rejects.toThrow(
      '保存到相册需要一个文件名',
    );
    expect(module.saveImage).not.toHaveBeenCalled();
  });

  it('wraps a native rejection with the platform reason', async () => {
    const module = fakeModule();
    module.saveImage.mockImplementation(() =>
      Promise.reject(new Error('1234 boom')),
    );
    mockTurboModule.mockReturnValue(module);

    await expect(savePngToAlbum(PNG_BASE64, 'title')).rejects.toThrow(
      '保存到相册失败：1234 boom',
    );
  });

  it('rejects a success payload without a URI', async () => {
    const module = fakeModule();
    module.saveImage.mockImplementation(() =>
      Promise.resolve({saved: true, uri: '', title: 't'}),
    );
    mockTurboModule.mockReturnValue(module);

    await expect(savePngToAlbum(PNG_BASE64, 'title')).rejects.toThrow(
      '保存到相册成功但没有返回相册 URI',
    );
  });

  it('rejects an answer that is neither saved nor unsaved', async () => {
    const module = fakeModule();
    module.saveImage.mockImplementation(() => Promise.resolve({ok: true}));
    mockTurboModule.mockReturnValue(module);

    await expect(savePngToAlbum(PNG_BASE64, 'title')).rejects.toThrow(
      '无法识别的结果',
    );
  });
});

describe('isImageSaveAvailable', () => {
  it('is true only when the module exposes saveImage', () => {
    expect(isImageSaveAvailable()).toBe(true);

    mockTurboModule.mockReturnValue({});
    expect(isImageSaveAvailable()).toBe(false);

    mockTurboModule.mockReturnValue(null);
    expect(isImageSaveAvailable()).toBe(false);
  });
});

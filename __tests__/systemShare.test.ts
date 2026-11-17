/**
 * The JS face of the app's `CapabilityProbe` share method: the text hand-off,
 * the empty-text guard and the missing-module/rejection messages. The device
 * run is what proves ShareKit's panel opens.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {SHARE_DEMO_TEXT, shareText} from '../src/native/systemShare';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

type Probe = {
  shareText: jest.Mock<(text: string) => Promise<void>>;
};

const mockTurboModule = getTurboModule as unknown as {
  mockReturnValue: (value: unknown) => void;
};

function fakeProbe(): Probe {
  return {shareText: jest.fn()};
}

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeProbe());
});

it('hands the demo text to the native share panel', async () => {
  const probe = fakeProbe();
  probe.shareText.mockImplementation(() => Promise.resolve());
  mockTurboModule.mockReturnValue(probe);

  await expect(shareText(SHARE_DEMO_TEXT)).resolves.toBeUndefined();
  expect(probe.shareText).toHaveBeenCalledWith(SHARE_DEMO_TEXT);
  expect(SHARE_DEMO_TEXT).toBe('来自 KMP 平台能力演示的分享文本');
});

it('refuses empty text without calling the platform', async () => {
  const probe = fakeProbe();
  mockTurboModule.mockReturnValue(probe);

  await expect(shareText('   ')).rejects.toThrow('没有可分享的文本');
  expect(probe.shareText).not.toHaveBeenCalled();
});

it('rejects with a clear reason when the module is not registered', async () => {
  mockTurboModule.mockReturnValue(null);

  await expect(shareText(SHARE_DEMO_TEXT)).rejects.toThrow(
    'CapabilityProbe 模块没有注册（shareText 不存在）',
  );
});

it('turns a native rejection into the row reason', async () => {
  const probe = fakeProbe();
  probe.shareText.mockImplementation(() =>
    Promise.reject({message: 'Capability not supported', code: 801}),
  );
  mockTurboModule.mockReturnValue(probe);

  await expect(shareText(SHARE_DEMO_TEXT)).rejects.toThrow(
    'Capability not supported（code 801）',
  );
});

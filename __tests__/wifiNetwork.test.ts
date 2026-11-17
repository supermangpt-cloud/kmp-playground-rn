/**
 * The JS face of the app's `WifiNetwork` module: the scan payload, the three
 * connect outcomes, the linked-SSID refusal, and the guards that stop a broken
 * payload from becoming a row. The device run proves @ohos.wifiManager.
 */
import {beforeEach, expect, it, jest} from '@jest/globals';

import {
  connectWifi,
  isWifiAvailable,
  readCurrentSsid,
  scanWifi,
} from '../src/native/wifiNetwork';
import {getTurboModule} from '../src/native/turboModule';

jest.mock('../src/native/turboModule', () => ({
  getTurboModule: jest.fn(),
}));

type Wifi = {
  scan: jest.Mock<() => Promise<unknown>>;
  connect: jest.Mock<
    (ssid: string, password: string, securityType: number) => Promise<unknown>
  >;
  currentSsid: jest.Mock<() => Promise<unknown>>;
};

type MockWith = {
  mockReturnValue: (value: unknown) => void;
};

const mockTurboModule = getTurboModule as unknown as MockWith;

function fakeWifi(): Wifi {
  return {
    scan: jest.fn(),
    connect: jest.fn(),
    currentSsid: jest.fn(),
  };
}

const AP = {
  ssid: 'KMP-Demo',
  rssi: -45,
  secured: true,
  securityType: 3,
  security: 'WPA2',
};

const OPEN_AP = {
  ssid: 'Guest',
  rssi: -60,
  secured: false,
  securityType: 1,
  security: '开放',
};

beforeEach(() => {
  mockTurboModule.mockReturnValue(fakeWifi());
});

it('returns the scan list with the Wi-Fi and location switch states', async () => {
  const wifi = fakeWifi();
  wifi.scan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [AP, OPEN_AP],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  mockTurboModule.mockReturnValue(wifi);

  await expect(scanWifi()).resolves.toEqual({
    accessPoints: [AP, OPEN_AP],
    wifiActive: true,
    locationEnabled: true,
    reason: '',
  });
  expect(wifi.scan).toHaveBeenCalledTimes(1);
});

it('keeps an empty list separate from the switches that explain it', async () => {
  const wifi = fakeWifi();
  wifi.scan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [],
      wifiActive: true,
      locationEnabled: false,
      reason: '扫描超时，显示系统最近一次扫描结果',
    }),
  );
  mockTurboModule.mockReturnValue(wifi);

  await expect(scanWifi()).resolves.toEqual({
    accessPoints: [],
    wifiActive: true,
    locationEnabled: false,
    reason: '扫描超时，显示系统最近一次扫描结果',
  });
});

it('rejects a scan payload with an AP that has no SSID', async () => {
  const wifi = fakeWifi();
  wifi.scan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [{...AP, ssid: ''}],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  mockTurboModule.mockReturnValue(wifi);

  await expect(scanWifi()).rejects.toThrow('没有 SSID');
});

it('rejects a scan payload with an invalid RSSI or security type', async () => {
  const wifi = fakeWifi();
  wifi.scan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [{...AP, rssi: 'strong'}],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  mockTurboModule.mockReturnValue(wifi);
  await expect(scanWifi()).rejects.toThrow('无效的 RSSI');

  wifi.scan.mockImplementation(() =>
    Promise.resolve({
      accessPoints: [{...AP, securityType: 'WPA2'}],
      wifiActive: true,
      locationEnabled: true,
      reason: '',
    }),
  );
  await expect(scanWifi()).rejects.toThrow('无效的加密类型');
});

it('sends the typed password for a secured AP and the type from the scan', async () => {
  const wifi = fakeWifi();
  wifi.connect.mockImplementation(() =>
    Promise.resolve({outcome: 'connected'}),
  );
  mockTurboModule.mockReturnValue(wifi);

  await expect(connectWifi(AP, 'secret-123')).resolves.toEqual({
    outcome: 'connected',
  });
  expect(wifi.connect).toHaveBeenCalledWith('KMP-Demo', 'secret-123', 3);
});

it('does not send a password for an open AP', async () => {
  const wifi = fakeWifi();
  wifi.connect.mockImplementation(() =>
    Promise.resolve({outcome: 'connected'}),
  );
  mockTurboModule.mockReturnValue(wifi);

  await connectWifi(OPEN_AP, 'ignored');
  expect(wifi.connect).toHaveBeenCalledWith('Guest', '', 1);
});

it('maps the system dialog cancellation to userDeclined', async () => {
  const wifi = fakeWifi();
  wifi.connect.mockImplementation(() =>
    Promise.resolve({outcome: 'userDeclined', reason: ''}),
  );
  mockTurboModule.mockReturnValue(wifi);

  await expect(connectWifi(AP, 'secret-123')).resolves.toEqual({
    outcome: 'userDeclined',
  });
});

it('keeps the platform failure reason instead of a bare 失败', async () => {
  const wifi = fakeWifi();
  wifi.connect.mockImplementation(() =>
    Promise.resolve({
      outcome: 'failed',
      reason: '添加候选网络失败：201 Permission denied',
    }),
  );
  mockTurboModule.mockReturnValue(wifi);

  await expect(connectWifi(AP, 'secret-123')).resolves.toEqual({
    outcome: 'failed',
    reason: '添加候选网络失败：201 Permission denied',
  });
});

it('rejects an unknown connect outcome', async () => {
  const wifi = fakeWifi();
  wifi.connect.mockImplementation(() => Promise.resolve({outcome: 'maybe'}));
  mockTurboModule.mockReturnValue(wifi);

  await expect(connectWifi(AP, 'secret-123')).rejects.toThrow('未知结果');
});

it('returns a known empty SSID and a real refusal differently', async () => {
  const wifi = fakeWifi();
  wifi.currentSsid
    .mockImplementationOnce(() =>
      Promise.resolve({known: true, ssid: '', reason: ''}),
    )
    .mockImplementationOnce(() =>
      Promise.resolve({
        known: false,
        ssid: '',
        reason: '201 Permission denied',
      }),
    );
  mockTurboModule.mockReturnValue(wifi);

  await expect(readCurrentSsid()).resolves.toEqual({
    known: true,
    ssid: '',
    reason: '',
  });
  await expect(readCurrentSsid()).resolves.toEqual({
    known: false,
    ssid: '',
    reason: '201 Permission denied',
  });
});

it('reports whether the module is registered', () => {
  mockTurboModule.mockReturnValue(fakeWifi());
  expect(isWifiAvailable()).toBe(true);

  mockTurboModule.mockReturnValue(null);
  expect(isWifiAvailable()).toBe(false);
});

it('rejects with a clear reason when the module is not registered', async () => {
  mockTurboModule.mockReturnValue(null);

  await expect(scanWifi()).rejects.toThrow('WifiNetwork 模块没有注册');
  await expect(readCurrentSsid()).rejects.toThrow('WifiNetwork 模块没有注册');
});

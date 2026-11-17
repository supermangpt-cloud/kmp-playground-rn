/**
 * The URL row's guard: the same `isNavigableUrl` rule the H5 page applies has
 * to run before `Linking.openURL`, so a scanned `tuitui://…` link can never be
 * handed to the system browser from the capability page.
 */
import {Linking} from 'react-native';
import {beforeEach, expect, it, jest} from '@jest/globals';

import {openExternalUrl} from '../src/native/urlOpener';

const openURL = jest.spyOn(Linking, 'openURL');

beforeEach(() => {
  openURL.mockReset();
  openURL.mockImplementation(() => Promise.resolve());
});

it('opens an http(s) URL after trimming it', async () => {
  const outcome = await openExternalUrl('  https://example.com  ');

  expect(outcome).toEqual({ok: true, url: 'https://example.com'});
  expect(openURL).toHaveBeenCalledWith('https://example.com');
});

it('refuses a non-http(s) URL without touching the platform', async () => {
  for (const candidate of ['tuitui://demo', 'javascript:alert(1)', 'file:///x']) {
    const outcome = await openExternalUrl(candidate);

    expect(outcome.ok).toBe(false);
    expect(outcome).toEqual({
      ok: false,
      reason: `只允许打开 http/https 链接：${candidate}`,
    });
  }
  expect(openURL).not.toHaveBeenCalled();
});

it('reports a platform failure instead of throwing', async () => {
  openURL.mockImplementation(() => Promise.reject(new Error('没有浏览器')));

  const outcome = await openExternalUrl('https://example.com');

  expect(outcome).toEqual({
    ok: false,
    reason: '系统无法打开链接：没有浏览器',
  });
});

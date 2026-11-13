/**
 * Unit tests for the URL rules ported from the KMP `WebUrl.kt`.
 *
 * `isWebUrl` decides what a scanner result may open; `isNavigableUrl` is the
 * WebView navigation guard. The invalid cases are the ones the KMP build hit in
 * production (`tuitui://` landing pages) or rejects for safety (`javascript:`,
 * `file:`, `data:`).
 *
 * @format
 */

import {describe, expect, it} from '@jest/globals';

import {isNavigableUrl, isWebUrl} from '../src/ui/webUrl';

describe('isWebUrl', () => {
  it('accepts http and https URLs in any letter case', () => {
    expect(isWebUrl('https://example.com/a?b=1')).toBe(true);
    expect(isWebUrl('HTTP://example.com')).toBe(true);
    expect(isWebUrl('  https://example.com  ')).toBe(true);
  });

  it('rejects schemes that are not web pages', () => {
    expect(isWebUrl('tuitui://h5-demo/landing')).toBe(false);
    // eslint-disable-next-line no-script-url
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('file:///data/local/tmp/a.html')).toBe(false);
    expect(isWebUrl('data:text/html,<h1>x</h1>')).toBe(false);
    expect(isWebUrl('https.evil://example.com')).toBe(false);
  });

  it('rejects a scheme without a body and URLs with whitespace', () => {
    expect(isWebUrl('')).toBe(false);
    expect(isWebUrl('https://')).toBe(false);
    expect(isWebUrl('https://example.com/a b')).toBe(false);
    expect(isWebUrl('https://example.com/\nnext')).toBe(false);
  });
});

describe('isNavigableUrl', () => {
  it('allows only http(s) navigation', () => {
    expect(isNavigableUrl('https://example.com')).toBe(true);
    expect(isNavigableUrl('http://example.com/a?b=1')).toBe(true);
    expect(isNavigableUrl('HTTPS://EXAMPLE.COM')).toBe(true);
  });

  it('rejects custom schemes and scheme lookalikes', () => {
    expect(isNavigableUrl('tuitui://h5-demo/landing')).toBe(false);
    expect(isNavigableUrl('intent://scan/#Intent;scheme=zxing;end')).toBe(
      false,
    );
    // eslint-disable-next-line no-script-url
    expect(isNavigableUrl('javascript:alert(1)')).toBe(false);
    expect(isNavigableUrl('file:///etc/passwd')).toBe(false);
    expect(isNavigableUrl('content://media/1')).toBe(false);
    expect(isNavigableUrl('about:blank')).toBe(false);
    expect(isNavigableUrl('https.evil://example.com')).toBe(false);
    expect(isNavigableUrl(' https://example.com')).toBe(false);
    expect(isNavigableUrl('https://example.com:8443/x')).toBe(true);
  });
});

/**
 * URL rules shared by the H5 page, ported from the KMP build's
 * `shared/src/commonMain/kotlin/com/example/kmp/ui/WebUrl.kt`.
 *
 * The KMP build learned the hard way that a scanned landing page can redirect
 * to a custom scheme (`tuitui://…`). Android's WebView answers that with
 * `ERR_UNKNOWN_URL_SCHEME`, so the navigation must be rejected before it is
 * handed to the native view.
 */

const WEB_SCHEMES = ['https://', 'http://'] as const;

/**
 * True when [text] is a web page the in-app WebView may open: `http://` or
 * `https://` (any letter case) followed by at least one character, with no
 * whitespace or control characters in it.
 *
 * Everything else, including `javascript:`, `file:`, `ftp:` and `data:` URLs,
 * is not a navigable web URL. Leading and trailing whitespace is ignored,
 * which is how scanners often deliver the payload; callers open the trimmed
 * value.
 */
export function isWebUrl(text: string): boolean {
  const candidate = text.trim();
  const scheme = WEB_SCHEMES.find(item =>
    candidate.toLowerCase().startsWith(item),
  );
  if (scheme === undefined) {
    return false;
  }
  const rest = candidate.slice(scheme.length);
  // eslint-disable-next-line no-control-regex
  return rest.length > 0 && !/[\s\u0000-\u001f\u007f]/.test(rest);
}

/**
 * True when the WebView may navigate to [url] by itself.
 *
 * Only `http` and `https` qualify. Anything else, such as a landing page's
 * automatic redirect to an app deep link (`tuitui://…`), `intent://`,
 * `file://`, `content://` or `javascript:`, must not load inside the panel:
 * the platform WebViews either show an error page for an unknown scheme
 * (Android's `ERR_UNKNOWN_URL_SCHEME`) or would hand a page the means to open
 * other apps or read local files.
 *
 * The scheme is compared without regard to case, and the part before the
 * first `:` must be exactly the scheme, so `https.evil://x` and ` https://x`
 * do not pass by prefix accident.
 */
export function isNavigableUrl(url: string): boolean {
  const colon = url.indexOf(':');
  if (colon < 0) {
    return false;
  }
  const scheme = url.slice(0, colon).toLowerCase();
  return scheme === 'http' || scheme === 'https';
}

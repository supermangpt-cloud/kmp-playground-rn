/**
 * Opens an external http(s) link in the system browser.
 *
 * The rule is the same one the H5 page uses: `src/ui/webUrl.ts`'s
 * `isNavigableUrl`, ported from KMP's `GuardedUrlOpener`. Only http/https reach
 * `Linking.openURL`, so a landing page's `tuitui://…` redirect can never be
 * launched from here.
 */
import {Linking} from 'react-native';

import {isNavigableUrl} from '../ui/webUrl';

/** The link the capability row hands to the browser (KMP uses the same one). */
export const DEMO_URL = 'https://example.com';

export type UrlOpenOutcome =
  | {ok: true; url: string}
  | {ok: false; reason: string};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolves with the URL handed to the system, or with the reason it was
 * refused. `Linking.openURL` failures come back as `{ok: false}` so the row can
 * print them instead of throwing.
 */
export async function openExternalUrl(raw: string): Promise<UrlOpenOutcome> {
  const candidate = raw.trim();
  if (!isNavigableUrl(candidate)) {
    return {ok: false, reason: `只允许打开 http/https 链接：${candidate}`};
  }
  try {
    await Linking.openURL(candidate);
    return {ok: true, url: candidate};
  } catch (error) {
    return {ok: false, reason: `系统无法打开链接：${messageOf(error)}`};
  }
}

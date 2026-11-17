/**
 * JS side of the app's `CapabilityProbe` system-share method.
 *
 * The ArkTS side hands the text to ShareKit's `SystemShare` panel. Its promise
 * resolves once the panel was presented and does not wait for the user to pick
 * a target, because HarmonyOS does not report that back; callers must not word
 * the result as "shared", only as "the panel opened".
 */
import {getTurboModule} from './turboModule';

/** The text the capability page shares, the same sentence the KMP build uses. */
export const SHARE_DEMO_TEXT = '来自 KMP 平台能力演示的分享文本';

type NativeShare = {
  shareText: (text: string) => Promise<void>;
};

function requireShare(): NativeShare {
  const module = getTurboModule<NativeShare>('CapabilityProbe');
  if (module === null || typeof module.shareText !== 'function') {
    throw new Error('CapabilityProbe 模块没有注册（shareText 不存在）');
  }
  return module;
}

function reasonOf(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const {message, code} = error as {message?: unknown; code?: unknown};
    if (typeof message === 'string' && message.length > 0) {
      return code === undefined
        ? message
        : `${message}（code ${String(code)}）`;
    }
  }
  return fallback;
}

/** Opens the system share panel with `text`. */
export async function shareText(text: string): Promise<void> {
  if (text.trim().length === 0) {
    throw new Error('没有可分享的文本');
  }
  try {
    await requireShare().shareText(text);
  } catch (error) {
    throw new Error(reasonOf(error, '拉起系统分享面板失败'));
  }
}

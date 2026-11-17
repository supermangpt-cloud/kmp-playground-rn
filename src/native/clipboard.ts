/**
 * JS side of `@react-native-oh-tpl/clipboard`'s HarmonyOS module.
 *
 * Direct turbo module access for the same reason as
 * `src/native/imagePicker.ts` and `src/native/asyncStorage.ts`: the package's
 * own binding resolves through RN 0.72's legacy `NativeModules` table, which
 * RNOH answers with an empty stub.
 *
 * Writing is fire-and-forget in the ArkTS module (`setString` returns nothing
 * and only logs a failure). Reading asks for `ohos.permission.READ_PASTEBOARD`
 * first and rejects when the platform refuses it; on this device that
 * permission is `system_basic`, so a normal app cannot hold it and
 * programmatic reads fail. Callers report that as the platform limitation
 * rather than as a bug.
 */
import {getTurboModule} from './turboModule';

type NativeClipboard = {
  getString: () => Promise<string>;
  setString: (text: string) => void;
};

function requireClipboard(): NativeClipboard {
  const module = getTurboModule<NativeClipboard>('RNCClipboard');
  if (
    module === null ||
    typeof module.getString !== 'function' ||
    typeof module.setString !== 'function'
  ) {
    throw new Error('Clipboard 模块没有注册（RNCClipboard 不存在）');
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

/** Writes `text` to the system clipboard. */
export function setString(text: string): void {
  requireClipboard().setString(text);
}

/** Reads the clipboard's primary text; rejects with the platform's reason. */
export async function getString(): Promise<string> {
  try {
    return await requireClipboard().getString();
  } catch (error) {
    throw new Error(reasonOf(error, '读取剪贴板失败'));
  }
}

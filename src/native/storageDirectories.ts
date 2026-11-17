/**
 * JS side of the app's `CapabilityProbe` ArkTS module for the 存储目录 card.
 *
 * The ArkTS method returns the seven rows of the KMP build's HarmonyOS card,
 * with a real `fs.accessSync` probe per path and the platform's own note when
 * a public directory cannot be read (201 permission, 801 device type). This
 * wrapper keeps that runtime note and adds the three static HarmonyOS notes the
 * KMP card shows, so a missing path is explained instead of invented:
 *
 * - public Download/Document paths are sandbox-mapped paths on the devices that
 *   support them;
 * - the album is a `photoAccessHelper` URI library and has no directory path.
 */
import {getTurboModule} from './turboModule';

/** The seven kinds the HarmonyOS card lists, in its order. */
export type DirectoryKind =
  | 'Cache'
  | 'Files'
  | 'Database'
  | 'Temp'
  | 'Downloads'
  | 'Documents'
  | 'PhotoAlbum';

export type StorageDirectory = {
  kind: DirectoryKind;
  /** Absolute path, or undefined when this platform has no directory for it. */
  path?: string;
  /** A real probe of that path during this read, not a constant. */
  exists: boolean;
  /** Why the path is absent, or a caveat about it. */
  note?: string;
};

type RawDirectory = {
  kind: string;
  path: string;
  exists: boolean;
  note: string;
};

type NativeCapabilityProbe = {
  readDirectories: (requestPermissions: boolean) => Promise<RawDirectory[]>;
};

const KINDS: readonly DirectoryKind[] = [
  'Cache',
  'Files',
  'Database',
  'Temp',
  'Downloads',
  'Documents',
  'PhotoAlbum',
];

const STATIC_NOTES: Partial<Record<DirectoryKind, string>> = {
  Downloads: '公共下载目录的沙箱映射路径',
  Documents: '公共文档目录的沙箱映射路径',
  PhotoAlbum:
    '鸿蒙相册通过 photoAccessHelper 的 URI 访问（如 file://media/Photo/...），没有可直接使用的目录路径',
};

const MISSING_NOTE = '该目录在当前平台不可用';

function requireProbe(): NativeCapabilityProbe {
  const module = getTurboModule<NativeCapabilityProbe>('CapabilityProbe');
  if (module === null || typeof module.readDirectories !== 'function') {
    throw new Error('CapabilityProbe 模块没有注册（readDirectories 不存在）');
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

function isKind(value: string): value is DirectoryKind {
  return (KINDS as readonly string[]).includes(value);
}

/**
 * Reads the seven directories. `requestPermissions` is true only for the
 * explicit 刷新 press; the page's first read passes false and never shows a
 * permission dialog.
 */
export async function readDirectories(
  requestPermissions: boolean,
): Promise<StorageDirectory[]> {
  let raw: RawDirectory[];
  try {
    raw = await requireProbe().readDirectories(requestPermissions);
  } catch (error) {
    throw new Error(reasonOf(error, '读取存储目录失败'));
  }
  if (!Array.isArray(raw)) {
    throw new Error('存储目录模块没有返回目录列表');
  }
  return raw.map(row => {
    if (
      typeof row?.kind !== 'string' ||
      !isKind(row.kind) ||
      typeof row.path !== 'string' ||
      typeof row.exists !== 'boolean' ||
      typeof row.note !== 'string'
    ) {
      throw new Error(
        `存储目录模块返回了无法识别的目录：${JSON.stringify(row)}`,
      );
    }
    const path = row.path.length > 0 ? row.path : undefined;
    // A runtime note (permission refused, 801 device type) wins over the static
    // explanation; a null path always ends up with some note.
    const note =
      row.note.length > 0
        ? row.note
        : STATIC_NOTES[row.kind] ??
          (path === undefined ? MISSING_NOTE : undefined);
    return {
      kind: row.kind,
      path,
      exists: path !== undefined ? row.exists : false,
      note,
    };
  });
}

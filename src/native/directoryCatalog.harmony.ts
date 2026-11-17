/**
 * The 存储目录 card's HarmonyOS explanations, kept for the platform bundle.
 *
 * The ArkTS module returns the real paths and the runtime refusal (201 / 801)
 * as the row's note; these static notes explain the three rows that either
 * have no directory path or are a sandbox mapping rather than the real public
 * path.
 */
import type {DirectoryKind} from './storageDirectories';

export const DIRECTORY_NOTES: Partial<Record<DirectoryKind, string>> = {
  Downloads: '公共下载目录的沙箱映射路径',
  Documents: '公共文档目录的沙箱映射路径',
  PhotoAlbum:
    '鸿蒙相册通过 photoAccessHelper 的 URI 访问（如 file://media/Photo/...），没有可直接使用的目录路径',
};

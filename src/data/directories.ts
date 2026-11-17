/**
 * The Chinese labels of the 存储目录 card, copied from the KMP build's
 * `DirectoryKind.label` values and drawn in the same order.
 */
import type {DirectoryKind} from '../native/storageDirectories';

export const DIRECTORY_LABELS: Record<DirectoryKind, string> = {
  Cache: '缓存',
  Files: '文件',
  Database: '数据库',
  Temp: '临时',
  Downloads: '下载',
  Documents: '文档',
  PhotoAlbum: '相册',
};

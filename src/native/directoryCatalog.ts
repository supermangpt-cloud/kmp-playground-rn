/**
 * What the 存储目录 card says about the rows whose path is empty or has a
 * platform caveat, on Android and iOS.
 *
 * The native modules return the real paths and a runtime note when there is
 * one; these are the fallbacks used when a path is absent (the album has no
 * directory at all on either platform) or when the platform's storage model
 * needs explaining.
 */
import {Platform} from 'react-native';

import type {DirectoryKind} from './storageDirectories';

const IS_IOS = Platform.OS === 'ios';

export const DIRECTORY_NOTES: Partial<Record<DirectoryKind, string>> = IS_IOS
  ? {
      Downloads: 'iOS 没有公共下载目录；文件应放进 App 自己的 Documents',
      Documents:
        'iOS 的 Documents 是 App 私有目录（在 Info.plist 打开 UIFileSharingEnabled 后可由文件 App 访问）',
      PhotoAlbum:
        'iOS 相册通过 PHPhotoLibrary 的本地标识访问，没有可直接使用的目录路径',
    }
  : {
      Downloads:
        '公共下载目录；Android 10+ 的分区存储下应用只能读写自己创建的文件',
      Documents:
        '公共文档目录；Android 10+ 的分区存储下应用只能读写自己创建的文件',
      PhotoAlbum:
        'Android 相册通过 MediaStore 的 content:// URI 访问，没有可直接使用的目录路径',
    };

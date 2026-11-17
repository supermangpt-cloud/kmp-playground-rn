import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import type { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';

/**
 * What one save attempt reports.
 *
 * The two expected outcomes — the user refused the permission, and the platform
 * could not write the asset — are values here rather than rejections, so the
 * JS side can tell "show 去设置" from "show the failure reason". Throwing would
 * collapse both into an Error string.
 */
export interface SaveImagePayload {
  saved: boolean;
  /** Album URI of the new asset; '' unless `saved` is true. */
  uri: string;
  /** Asset title that was written; '' unless `saved` is true. */
  title: string;
  /** True only when the user refused WRITE_IMAGEVIDEO. */
  permissionDenied: boolean;
  /** Why the save did not happen; '' on success. */
  reason: string;
}

/** Outcome of the runtime permission step. */
interface PermissionOutcome {
  granted: boolean;
  denied: boolean;
  reason: string;
}

/** Saving one image needs this ACL-restricted, user_grant permission. */
const WRITE_IMAGE_VIDEO: Permissions = 'ohos.permission.WRITE_IMAGEVIDEO';

/** The PNG signature, checked before writing and after reading the asset back. */
const PNG_SIGNATURE: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The app's own album writer for the QR page and the 保存图片到相册 capability row.
 *
 * `@react-native-oh-tpl/camera-roll` cannot compile against RNOH 0.72.140, and
 * RN 0.72 has no writable file API, so both were replaced by this module and
 * the KMP build's already-verified HarmonyOS path:
 *
 *   request WRITE_IMAGEVIDEO
 *     -> write the PNG to a cache file
 *     -> photoAccessHelper.createAsset(PhotoType.IMAGE, 'png', {title})
 *     -> open the returned URI / write / close
 *     -> read the asset back and check its size and PNG signature
 *
 * The last step is deliberate: the page must not say 已保存到相册 unless the
 * album asset really holds the PNG. `createAsset` — not
 * `createAssetWithShortTermPermission` — is the API the ticket verified on the
 * KMP build; the latter needs SHORT_TERM_WRITE_IMAGEVIDEO.
 */
export class ImageSaveTurboModule extends TurboModule {
  private context: common.UIAbilityContext;

  constructor(ctx: TurboModuleContext) {
    super(ctx);
    this.context = ctx.uiAbilityContext;
  }

  async saveImage(base64: string, title: string): Promise<SaveImagePayload> {
    if (typeof base64 !== 'string' || base64.length === 0) {
      return this.failure('没有可保存的 PNG 内容');
    }
    let bytes: Uint8Array;
    try {
      bytes = new util.Base64Helper().decodeSync(base64);
    } catch (error) {
      return this.failure(`PNG base64 解码失败：${this.describe(error as BusinessError)}`);
    }
    if (!this.hasPngSignature(bytes)) {
      return this.failure('传入的内容不是 PNG');
    }

    const permission = await this.ensurePermission();
    if (!permission.granted) {
      return {
        saved: false,
        uri: '',
        title: '',
        permissionDenied: permission.denied,
        reason: permission.reason,
      };
    }

    const safeTitle = this.safeTitle(title);
    const tempPath = `${this.context.cacheDir}/qr-save-${Date.now()}.png`;
    let assetUri = '';
    try {
      // The cache file mirrors the KMP path; it also gives createAsset-written
      // assets no dependency on a source file that could vanish mid-write.
      this.writeFile(tempPath, bytes);
      const helper = photoAccessHelper.getPhotoAccessHelper(this.context);
      assetUri = await helper.createAsset(
        photoAccessHelper.PhotoType.IMAGE,
        'png',
        { title: safeTitle },
      );
      // The media URI is opened READ_WRITE only: it already exists, and a
      // CREATE/TRUNC request on a media-library URI is refused with 13900001.
      this.writeAssetFile(assetUri, bytes);
      const size = fs.statSync(assetUri).size;
      if (size !== bytes.length) {
        return this.failure(
          `相册资源大小不符：应写入 ${bytes.length} 字节，实际 ${size} 字节`,
        );
      }
      this.requirePngSignature(assetUri);
      return {
        saved: true,
        uri: assetUri,
        title: safeTitle,
        permissionDenied: false,
        reason: '',
      };
    } catch (error) {
      return this.failure(`写入相册失败：${this.describe(error as BusinessError)}`);
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch (error) {
        console.info(`ImageSave: 临时文件已在关闭时移除（${this.describe(error as BusinessError)}）`);
      }
    }
  }

  /**
   * Reads the current grant; asks only when it is missing. `authResults` is 0
   * for granted and -1 for refused; any other code means the platform could not
   * even ask (for example the module manifest lacks the declaration).
   */
  private async ensurePermission(): Promise<PermissionOutcome> {
    const manager = abilityAccessCtrl.createAtManager();
    const tokenId = this.context.applicationInfo.accessTokenId;
    try {
      const status = manager.checkAccessTokenSync(tokenId, WRITE_IMAGE_VIDEO);
      if (status === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
        return { granted: true, denied: false, reason: '' };
      }
    } catch (error) {
      return {
        granted: false,
        denied: false,
        reason: `查询相册写入权限失败：${this.describe(error as BusinessError)}`,
      };
    }

    try {
      const result = await manager.requestPermissionsFromUser(this.context, [
        WRITE_IMAGE_VIDEO,
      ]);
      if (result.authResults.length === 0) {
        return {
          granted: false,
          denied: false,
          reason: '相册写入权限申请没有返回结果',
        };
      }
      const code = result.authResults[0];
      if (code === 0) {
        return { granted: true, denied: false, reason: '' };
      }
      if (code === -1) {
        return {
          granted: false,
          denied: true,
          reason: '相册写入权限被拒绝（WRITE_IMAGEVIDEO）',
        };
      }
      return {
        granted: false,
        denied: false,
        reason: `相册写入权限申请返回了 ${code}（WRITE_IMAGEVIDEO 是否已在 module.json5 声明并带 ACL？）`,
      };
    } catch (error) {
      return {
        granted: false,
        denied: false,
        reason: `申请相册写入权限失败：${this.describe(error as BusinessError)}`,
      };
    }
  }

  /** Writes the whole buffer, closing the descriptor even when write throws. */
  private writeFile(path: string, bytes: Uint8Array): void {
    const file = fs.openSync(
      path,
      fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC,
    );
    try {
      this.writeBytes(file.fd, bytes);
    } finally {
      fs.closeSync(file);
    }
  }

  /**
   * Writes into the asset URI `createAsset` returned. The URI already exists,
   * so opening it READ_WRITE (without CREATE/TRUNC) is what the media library
   * accepts; the KMP build's verified saveWithAcl uses the same flags.
   */
  private writeAssetFile(uri: string, bytes: Uint8Array): void {
    const file = fs.openSync(uri, fs.OpenMode.READ_WRITE);
    try {
      this.writeBytes(file.fd, bytes);
    } finally {
      fs.closeSync(file);
    }
  }

  private writeBytes(fd: number, bytes: Uint8Array): void {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    fs.writeSync(fd, buffer);
  }

  /** Opens the asset and requires its first eight bytes to be the PNG magic. */
  private requirePngSignature(uri: string): void {
    const file = fs.openSync(uri, fs.OpenMode.READ_ONLY);
    try {
      const header = new ArrayBuffer(PNG_SIGNATURE.length);
      const read = fs.readSync(file.fd, header);
      if (read < PNG_SIGNATURE.length) {
        throw new Error(`相册资源只有 ${read} 字节，不是完整的 PNG`);
      }
      if (!this.hasPngSignature(new Uint8Array(header))) {
        throw new Error('相册资源不是 PNG（文件头不匹配）');
      }
    } finally {
      fs.closeSync(file);
    }
  }

  private hasPngSignature(bytes: Uint8Array): boolean {
    if (bytes.length < PNG_SIGNATURE.length) {
      return false;
    }
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
      if (bytes[i] !== PNG_SIGNATURE[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * createAsset rejects `.. \ / : * ? " ' ` < > | { } [ ]` in a title; the JS
   * side already sends a safe stamp, and this keeps a future caller safe too.
   */
  private safeTitle(title: string): string {
    const raw = typeof title === 'string' ? title.trim() : '';
    const fallback = `KMP-RN-QR-${Date.now()}`;
    if (raw.length === 0) {
      return fallback;
    }
    // Characters createAsset rejects; '..' is replaced as a pair first so the
    // result cannot contain a path segment.
    const forbidden: string[] = [
      '..', '\\', '/', ':', '*', '?', '"', "'", '`', '<', '>', '|', '{', '}', '[', ']',
    ];
    let cleaned = raw;
    for (const character of forbidden) {
      cleaned = cleaned.split(character).join('-');
    }
    cleaned = cleaned.trim();
    return cleaned.length === 0 ? fallback : cleaned;
  }

  private failure(reason: string): SaveImagePayload {
    return {
      saved: false,
      uri: '',
      title: '',
      permissionDenied: false,
      reason: reason,
    };
  }

  private describe(error: BusinessError): string {
    if (error !== undefined && error !== null && error.code !== undefined) {
      return `${error.code} ${error.message ?? ''}`.trim();
    }
    return `${error}`;
  }
}

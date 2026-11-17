/**
 * Platform-capability page: the RN port of KMP's `CapabilitiesScreen.kt`.
 *
 * The page is a skeleton, as the ticket asks: all 14 capabilities of the KMP
 * build are listed with the same titles, descriptions and order, but only the
 * capabilities the RN app already implements offer a button that really calls
 * the platform. Everything else prints `RN 版本暂未实现` where the KMP page puts
 * its button, so a row never looks tappable and then does nothing.
 *
 * The two rows that do work reuse the paths the scan page already had:
 * `src/native/imagePicker.ts` (the HarmonyOS system photo picker) and
 * `src/native/scanKit.ts` + `src/qr/imageDecode.ts` (native Scan Kit decoding
 * with the pure-JS `jsqr` fallback). Their result is printed inside the row,
 * like KMP's `ResultLine`.
 *
 * No dependency is added for the remaining rows: the ticket explicitly keeps
 * them unimplemented until a later ticket gives each one its own native path.
 */
import React, {useCallback, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {
  CAPABILITIES,
  Capability,
  CapabilityAction,
  UNIMPLEMENTED_NOTE,
} from '../data/capabilities';
import {getItem, removeItem, setItem} from '../native/asyncStorage';
import {
  getString as readClipboard,
  setString as writeClipboard,
} from '../native/clipboard';
import {readDeviceInfo} from '../native/deviceInfo';
import {launchImageLibrary} from '../native/imagePicker';
import {NetworkStatus, readNetworkStatus} from '../native/networkStatus';
import {decodeImage, isNativeScanAvailable} from '../native/scanKit';
import {DEMO_URL, openExternalUrl} from '../native/urlOpener';
import {decodeQrFromBase64} from '../qr/imageDecode';
import {colors} from '../ui/theme';

type Props = {
  onBack: () => void;
};

/** What a row prints under its header after its button ran. */
type RowOutcome =
  | {kind: 'busy'}
  | {kind: 'done'; text: string}
  | {kind: 'error'; text: string};

/** Key KMP's storage demo uses; removed at the end of every round trip. */
const STORAGE_DEMO_KEY = 'platform_capabilities.demo_key';

/** Four random digits, like KMP's `Random.nextInt(1000, 10_000)`. */
function randomSuffix(): string {
  return String(Math.floor(Math.random() * 9000) + 1000);
}

function statusLabel(capability: Capability): string {
  switch (capability.status) {
    case 'available':
      return '可用';
    case 'limited':
      return '部分可用';
    default:
      return '未实现';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** How the 网络状态 row prints one reading; `unknown` is not guessed. */
function networkText(status: NetworkStatus): string {
  const connection = status.connected ? '已联网' : '未联网';
  const type = status.type === 'unknown' ? '未知' : status.type;
  return `${connection} · ${type}`;
}

export default function CapabilitiesScreen({onBack}: Props): JSX.Element {
  const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({});
  // The picker is modal and the button stays mounted while it is open; a ref
  // stops a second press from opening a second picker behind the first.
  const busy = useRef(false);

  const setOutcome = useCallback((id: string, outcome: RowOutcome) => {
    setOutcomes(current => ({...current, [id]: outcome}));
  }, []);

  /** 「写 → 读 → 删 → 再读」: the full storage round trip, inline. */
  const storageRoundTrip = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const value = `rn-demo-${randomSuffix()}`;
        await setItem(STORAGE_DEMO_KEY, value);
        const readBack = await getItem(STORAGE_DEMO_KEY);
        await removeItem(STORAGE_DEMO_KEY);
        const afterRemove = await getItem(STORAGE_DEMO_KEY);
        setOutcome(id, {
          kind: 'done',
          text: `写入「${value}」→ 读回「${
            readBack ?? 'null'
          }」→ 删除 → 再读「${afterRemove ?? 'null'}」`,
        });
      } catch (error) {
        setOutcome(id, {kind: 'error', text: `失败：${messageOf(error)}`});
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「读取设备信息」: the real model, system and app build, as the device reports them. */
  const readDevice = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const info = await readDeviceInfo();
        setOutcome(id, {
          kind: 'done',
          text: `${info.model} · ${info.systemName} ${info.systemVersion} · ${info.appName} ${info.appVersion}`,
        });
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `读取失败：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「查询网络」: a fresh read on every press, so a changed network shows. */
  const probeNetwork = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const status = await readNetworkStatus();
        setOutcome(id, {kind: 'done', text: networkText(status)});
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `读取失败：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「打开链接」: the shared guard runs before the system browser sees it. */
  const openLink = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const result = await openExternalUrl(DEMO_URL);
        if (result.ok) {
          setOutcome(id, {
            kind: 'done',
            text: `已交给系统浏览器：${result.url}`,
          });
        } else {
          setOutcome(id, {kind: 'error', text: result.reason});
        }
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `无法打开链接：${messageOf(error)}`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /**
   * 「写入 → 读回」: the write always runs; a refused read is reported as the
   * platform limitation (HarmonyOS only grants clipboard reads to PasteButton),
   * not as a generic failure.
   */
  const clipboardRoundTrip = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      const value = `RN 剪贴板演示 ${randomSuffix()}`;
      try {
        writeClipboard(value);
      } catch (error) {
        setOutcome(id, {
          kind: 'error',
          text: `写入失败：${messageOf(error)}`,
        });
        busy.current = false;
        return;
      }
      try {
        const readBack = await readClipboard();
        setOutcome(id, {
          kind: 'done',
          text: `写入「${value}」→ 读回「${readBack}」`,
        });
      } catch (error) {
        setOutcome(id, {
          kind: 'done',
          text: `写入「${value}」成功；读回失败：${messageOf(
            error,
          )}（读取需要系统 PasteButton 安全控件授权）`,
        });
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /** 「从相册选图」: open the system picker and describe what came back. */
  const pickImage = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const result = await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 1,
        });
        if (result.didCancel === true) {
          setOutcome(id, {kind: 'done', text: '已取消选图'});
          return;
        }
        if (result.errorCode !== undefined) {
          setOutcome(id, {
            kind: 'error',
            text: `无法打开相册：${result.errorMessage ?? result.errorCode}`,
          });
          return;
        }
        const asset = result.assets?.[0];
        // The HarmonyOS picker reports a back-press cancel as an empty asset
        // list without `didCancel`, so an empty result is a cancel too.
        if (asset === undefined) {
          setOutcome(id, {kind: 'done', text: '已取消选图'});
          return;
        }
        const size =
          asset.fileSize !== undefined
            ? `${asset.fileSize} 字节`
            : asset.width !== undefined && asset.height !== undefined
            ? `${asset.width}×${asset.height}`
            : '大小未知';
        setOutcome(id, {
          kind: 'done',
          text: `已选择：${asset.fileName ?? '（无文件名）'} · ${
            asset.type ?? '未知类型'
          } · ${size}`,
        });
      } catch (error) {
        setOutcome(id, {kind: 'error', text: `失败：${messageOf(error)}`});
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  /**
   * 「图片解析二维码」: pick one image and decode it, through Scan Kit when the
   * native module is registered and through `jsqr` otherwise — the same two
   * paths the scan page's 从相册选图 uses.
   */
  const decodePickedImage = useCallback(
    async (id: string) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setOutcome(id, {kind: 'busy'});
      try {
        const nativeDecode = isNativeScanAvailable();
        const result = await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 1,
          maxWidth: 2000,
          maxHeight: 2000,
          // The native decoder reads the cache file; only the JS fallback needs
          // the memory-heavy base64 of the image.
          includeBase64: !nativeDecode,
        });
        if (result.didCancel === true) {
          setOutcome(id, {kind: 'done', text: '已取消选图'});
          return;
        }
        if (result.errorCode !== undefined) {
          setOutcome(id, {
            kind: 'error',
            text: `无法打开相册：${result.errorMessage ?? result.errorCode}`,
          });
          return;
        }
        const asset = result.assets?.[0];
        if (asset === undefined) {
          setOutcome(id, {kind: 'done', text: '已取消选图'});
          return;
        }
        if (nativeDecode && asset.uri !== undefined) {
          const native = await decodeImage(asset.uri);
          if (native.ok) {
            setOutcome(id, {
              kind: 'done',
              text: `解析到 ${native.values.length} 个：${native.values[0]}`,
            });
            return;
          }
          if (asset.base64 === undefined) {
            setOutcome(id, {kind: 'error', text: `失败：${native.error}`});
            return;
          }
        }
        if (asset.base64 === undefined) {
          setOutcome(id, {
            kind: 'error',
            text: '失败：图片选择器没有返回可用于解码的数据',
          });
          return;
        }
        const decoded = decodeQrFromBase64(asset.base64);
        if (!decoded.ok) {
          setOutcome(id, {kind: 'error', text: decoded.reason});
          return;
        }
        setOutcome(id, {kind: 'done', text: `解析到 1 个：${decoded.value}`});
      } catch (error) {
        setOutcome(id, {kind: 'error', text: `失败：${messageOf(error)}`});
      } finally {
        busy.current = false;
      }
    },
    [setOutcome],
  );

  const runAction = useCallback(
    (capability: Capability, action: CapabilityAction) => {
      switch (action) {
        case 'local-storage':
          storageRoundTrip(capability.id);
          return;
        case 'open-url':
          openLink(capability.id);
          return;
        case 'clipboard':
          clipboardRoundTrip(capability.id);
          return;
        case 'device-info':
          readDevice(capability.id);
          return;
        case 'network-status':
          probeNetwork(capability.id);
          return;
        case 'pick-image':
          pickImage(capability.id);
          return;
        case 'decode-image':
          decodePickedImage(capability.id);
          return;
      }
    },
    [
      clipboardRoundTrip,
      decodePickedImage,
      openLink,
      pickImage,
      probeNetwork,
      readDevice,
      storageRoundTrip,
    ],
  );

  return (
    <View style={styles.screen} testID="capabilities-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={onBack}
          style={({pressed}) => [styles.back, pressed && styles.pressed]}
          testID="capabilities-back">
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.count} testID="capabilities-count">
          共 {CAPABILITIES.length} 项
        </Text>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>平台能力</Text>
        <Text style={styles.subtitle}>
          每行一个能力，点按钮真的调用系统 API，结果显示在行内
        </Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        testID="capabilities-list">
        {CAPABILITIES.map(capability => {
          const outcome = outcomes[capability.id];
          const action = capability.action;
          const interactive =
            capability.status !== 'unimplemented' && action !== undefined;
          return (
            <View
              key={capability.id}
              style={styles.card}
              testID={`capability-row-${capability.id}`}>
              <View style={styles.cardHeader}>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{capability.title}</Text>
                  <Text style={styles.cardDetail}>{capability.detail}</Text>
                </View>
                <Text
                  style={[
                    styles.status,
                    capability.status === 'available' && styles.statusAvailable,
                    capability.status === 'limited' && styles.statusLimited,
                    capability.status === 'unimplemented' &&
                      styles.statusMissing,
                  ]}
                  testID={`capability-status-${capability.id}`}>
                  {statusLabel(capability)}
                </Text>
              </View>

              {interactive ? (
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      capability.actionLabel ?? capability.title
                    }
                    onPress={() => runAction(capability, action)}
                    style={({pressed}) => [
                      styles.actionButton,
                      pressed && styles.pressed,
                    ]}
                    testID={`capability-action-${capability.id}`}>
                    <Text style={styles.actionText}>
                      {capability.actionLabel}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                // No button at all: a disabled or dead button is what the
                // ticket forbids, so the reason takes the button's place.
                <Text
                  style={styles.unimplemented}
                  testID={`capability-note-${capability.id}`}>
                  {UNIMPLEMENTED_NOTE}
                </Text>
              )}

              {capability.limitation === undefined ? null : (
                <Text
                  style={styles.limitation}
                  testID={`capability-limitation-${capability.id}`}>
                  {capability.limitation}
                </Text>
              )}

              {outcome === undefined ? null : (
                <Text
                  style={[
                    styles.result,
                    outcome.kind === 'busy' && styles.resultBusy,
                    outcome.kind === 'error' && styles.resultError,
                  ]}
                  testID={`capability-result-${capability.id}`}>
                  {outcome.kind === 'busy' ? '调用中…' : outcome.text}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 8,
    paddingEnd: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  back: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
  },
  count: {
    marginLeft: 'auto',
    color: colors.textHint,
    fontSize: 12,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {
    alignSelf: 'flex-start',
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    alignSelf: 'flex-start',
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 24,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
    paddingRight: 8,
  },
  cardTitle: {
    alignSelf: 'flex-start',
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  cardDetail: {
    alignSelf: 'flex-start',
    marginTop: 2,
    color: colors.textHint,
    fontSize: 11,
    lineHeight: 18,
  },
  status: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '700',
  },
  statusAvailable: {
    borderColor: colors.discount,
    color: colors.discount,
  },
  statusLimited: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  statusMissing: {
    borderColor: colors.textFaint,
    color: colors.textHint,
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 19,
    backgroundColor: colors.accent,
  },
  actionText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 20,
  },
  unimplemented: {
    marginTop: 10,
    color: colors.textHint,
    fontSize: 12,
    lineHeight: 18,
  },
  limitation: {
    marginTop: 8,
    color: colors.accent,
    fontSize: 11,
    lineHeight: 17,
  },
  result: {
    marginTop: 8,
    color: colors.textBody,
    fontSize: 13,
    lineHeight: 20,
  },
  resultBusy: {
    color: colors.textSecondary,
  },
  resultError: {
    color: colors.delete,
  },
  pressed: {
    opacity: 0.7,
  },
});

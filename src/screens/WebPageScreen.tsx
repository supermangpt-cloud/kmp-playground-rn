/**
 * The H5 demo page: a local HTML document rendered by the HarmonyOS/Android/
 * iOS WebView adaptation of `react-native-webview`.
 *
 * The page never leaves the app: the HTML comes from `src/web/demo.html` via
 * `source={{html}}`, its button reports back through `postMessage`/`onMessage`,
 * and every navigation request is checked with `isNavigableUrl` first. A
 * `tuitui://…` link (the KMP build's real-world `ERR_UNKNOWN_URL_SCHEME` case)
 * is rejected and reported in the page chrome instead of being handed to the
 * native view.
 */
import React, {useCallback, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {WebView} from '@react-native-oh-tpl/react-native-webview';
import {colors} from '../ui/theme';
import {isNavigableUrl} from '../ui/webUrl';
import {demoHtmlWithInitialCount} from '../web/demoHtml';

type Props = {
  onBack: () => void;
};

type LoadRequest = {
  url: string;
};

const WAITING = '等待 H5 页面回传';

/**
 * `{"count":2,"at":"14:03:12"}` becomes `第 2 次点击 · 14:03:12`; anything
 * unexpected is shown verbatim so a debugging payload is never hidden.
 */
export function formatWebMessage(raw: string): string {
  const parsed = parseWebMessage(raw);
  if (parsed !== null) {
    return `第 ${parsed.count} 次点击 · ${parsed.at}`;
  }
  return raw;
}

/** The counter carried by the page's JSON payload, or null for anything else. */
function messageCount(raw: string): number | null {
  const parsed = parseWebMessage(raw);
  return parsed === null ? null : parsed.count;
}

function parseWebMessage(raw: string): {count: number; at: string} | null {
  try {
    const parsed = JSON.parse(raw) as {count?: unknown; at?: unknown};
    if (
      typeof parsed.count === 'number' &&
      typeof parsed.at === 'string' &&
      parsed.at.length > 0
    ) {
      return {count: parsed.count, at: parsed.at};
    }
  } catch {
    // Not JSON: not a page payload.
  }
  return null;
}

export default function WebPageScreen({onBack}: Props): JSX.Element {
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Remounting the WebView is how the local document is restored after the
  // HarmonyOS adaptation blanks it on a refused navigation (see the block
  // handler). The instance key forces a fresh native view; the seeded count
  // keeps the page's visible counter moving forward.
  const [webViewInstance, setWebViewInstance] = useState(0);
  const [restoredCount, setRestoredCount] = useState(0);
  const lastCount = useRef(0);
  // The HTML document itself may be loaded as about:blank/data: before it has
  // finished; only that first document may use a non-http(s) URL.
  const initialDocument = useRef(true);

  const handleShouldStartLoad = useCallback((request: LoadRequest): boolean => {
    if (
      initialDocument.current &&
      (request.url === 'about:blank' || request.url.startsWith('data:'))
    ) {
      return true;
    }
    if (isNavigableUrl(request.url)) {
      return true;
    }
    // Do not hand tuitui://, intent://, file://, javascript: … to the native
    // WebView: it would either show ERR_UNKNOWN_URL_SCHEME or open another app.
    setBlockedUrl(request.url);
    // @react-native-oh-tpl/react-native-webview@13.10.3 on HarmonyOS executes a
    // refused navigation by blanking the native view instead of leaving the
    // current document alone (reproduced on ALN-AL00/API 26). The page is local,
    // so remount the WebView with the same `source={{html}}`; the next instance
    // gets a fresh `initialDocument` allowance and a counter seeded from the
    // last postMessage, so the page stays interactive and the count keeps
    // increasing. Reloading via the ref was not used: the document was loaded
    // with `loadData`, and the adapter's reload()/refresh() gives no guarantee
    // that the data document comes back; a remount with the same source is
    // deterministic and lets us seed the counter.
    initialDocument.current = true;
    setRestoredCount(lastCount.current);
    setWebViewInstance(instance => instance + 1);
    return false;
  }, []);

  const handleMessage = useCallback((event: {nativeEvent: {data: string}}) => {
    const raw = event.nativeEvent.data;
    const count = messageCount(raw);
    if (count !== null) {
      lastCount.current = count;
    }
    setLastMessage(formatWebMessage(raw));
  }, []);

  const handleLoadEnd = useCallback(() => {
    initialDocument.current = false;
    setLoadError(null);
  }, []);

  return (
    <View style={styles.screen} testID="web-page">
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回列表"
          onPress={onBack}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}
          testID="web-back">
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.heading}>H5 演示</Text>
          <Text style={styles.address} numberOfLines={1}>
            src/web/demo.html · 本地 HTML
          </Text>
        </View>
      </View>

      <WebView
        key={webViewInstance}
        source={{html: demoHtmlWithInitialCount(restoredCount)}}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webView}
        testID="web-view"
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onLoadEnd={handleLoadEnd}
        onError={event =>
          setLoadError(event.nativeEvent.description ?? '页面加载失败')
        }
      />

      <View style={styles.statusBar}>
        <Text style={styles.statusLabel} testID="web-last-message">
          最近一次回传：{lastMessage ?? WAITING}
        </Text>
        {blockedUrl === null ? (
          <Text style={styles.hint} testID="web-blocked">
            http(s) 之外的跳转会在页面内被拦截
          </Text>
        ) : (
          <Text style={styles.blocked} testID="web-blocked">
            已拦截非 http(s) 跳转：{blockedUrl}
          </Text>
        )}
        {loadError === null ? null : (
          <Text style={styles.blocked} testID="web-error">
            页面加载失败：{loadError}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 14,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  headerText: {
    flex: 1,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  address: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textHint,
  },
  webView: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.accentSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  blocked: {
    marginTop: 4,
    fontSize: 12,
    color: '#B91C1C',
  },
  pressed: {
    opacity: 0.7,
  },
});

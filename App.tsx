/**
 * The React Native port of the KMP playground: product list, product detail
 * and cart, wired together with the cart state machine in `src/state/cart.ts`.
 *
 * Navigation is the same single `Screen` state the KMP build keeps in
 * `ui/App.kt` (`Screen.List` / `Screen.Detail` / ...), extended with a small
 * back stack so the system back key can walk back to the list. It is plain
 * React state on purpose: no navigation library and no extra dependency that
 * would need a separate HarmonyOS adaptation.
 *
 * 扫一扫 is no longer an RN page: `startScanner()` opens the standalone ArkTS
 * `pages/ScanPage` (Scan Kit customScan) above the RN surface and resolves
 * with what it found. A web URL opens the H5 page, anything else is shown as
 * text here, and a plain cancel leaves the list as it was.
 *
 * @format
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {startScanner} from './src/native/scanKit';
import {findProduct} from './src/data/products';
import CapabilitiesScreen from './src/screens/CapabilitiesScreen';
import CartScreen from './src/screens/CartScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import ProductListScreen from './src/screens/ProductListScreen';
import QrCodeScreen from './src/screens/QrCodeScreen';
import WebPageScreen from './src/screens/WebPageScreen';
import {useCart} from './src/state/cart';
import {colors} from './src/ui/theme';
import {isWebUrl} from './src/ui/webUrl';

/** The page the app shows; mirrors the KMP build's `Screen` sealed class. */
export type Screen =
  | {kind: 'list'}
  | {kind: 'detail'; productId: string}
  | {kind: 'cart'}
  | {kind: 'qr'}
  | {kind: 'web'; url?: string}
  | {kind: 'capabilities'};

/** A scanned value that is not a web page, or a scan failure to explain. */
type ScanNotice = {kind: 'result' | 'error'; text: string};

const INITIAL_SCREEN: Screen = {kind: 'list'};

function App(): JSX.Element {
  const cart = useCart();
  // A stack instead of one value so back can pop detail/cart without special
  // cases; the last entry is the visible page.
  const [history, setHistory] = useState<Screen[]>([INITIAL_SCREEN]);
  const historyRef = useRef(history);
  historyRef.current = history;
  const screen = history[history.length - 1];
  // A non-URL scan result (or a scanner failure) is a dialog over the list.
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);
  // The ArkTS page is pushed asynchronously; a ref stops a second tap from
  // opening it twice before the first push has covered the list.
  const scanning = useRef(false);

  const push = useCallback((next: Screen) => {
    setHistory(current => [...current, next]);
  }, []);
  const back = useCallback(() => {
    setHistory(current =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
  }, []);

  const closeScanNotice = useCallback(() => setScanNotice(null), []);

  /**
   * 扫一扫: ask the native module to open the self-drawn scan page, then route
   * its result. http(s) results open the H5 page; everything else (plus a
   * failure) is shown in a dialog; a plain cancel leaves the list untouched.
   */
  const openScan = useCallback(async () => {
    if (scanning.current) {
      return;
    }
    scanning.current = true;
    try {
      const result = await startScanner();
      if (result.ok) {
        const text = result.value.trim();
        if (isWebUrl(text)) {
          push({kind: 'web', url: text});
        } else {
          setScanNotice({kind: 'result', text: result.value});
        }
        return;
      }
      if (!result.cancelled) {
        setScanNotice({kind: 'error', text: result.error ?? '扫码失败'});
      }
    } finally {
      scanning.current = false;
    }
  }, [push]);

  // Android's hardware back key and the HarmonyOS back gesture both arrive as
  // `hardwareBackPress`. Returning true consumes the press; on the list we
  // return false so the platform closes the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (historyRef.current.length <= 1) {
          return false;
        }
        setHistory(current => current.slice(0, -1));
        return true;
      },
    );
    return () => subscription.remove();
  }, []);

  const listScreen = (
    <ProductListScreen
      cart={cart.cart}
      onOpenProduct={productId => push({kind: 'detail', productId})}
      onOpenCart={() => push({kind: 'cart'})}
      onAddToCart={cart.add}
      onIncrement={cart.increment}
      onDecrement={cart.decrement}
      onRemove={cart.remove}
      onOpenQr={() => push({kind: 'qr'})}
      onOpenScan={openScan}
      onOpenWebPage={() => push({kind: 'web'})}
      onOpenCapabilities={() => push({kind: 'capabilities'})}
    />
  );

  let content: JSX.Element;
  if (screen.kind === 'detail') {
    const product = findProduct(screen.productId);
    // An id that is not in the catalogue (only possible from a corrupted
    // restored state) falls back to the list instead of a blank page.
    content =
      product === undefined ? (
        listScreen
      ) : (
        <ProductDetailScreen
          product={product}
          onBack={back}
          onAddToCart={cart.add}
        />
      );
  } else if (screen.kind === 'cart') {
    content = (
      <CartScreen
        cart={cart.cart}
        onBack={back}
        onIncrement={cart.increment}
        onDecrement={cart.decrement}
      />
    );
  } else if (screen.kind === 'qr') {
    content = <QrCodeScreen onBack={back} />;
  } else if (screen.kind === 'web') {
    content = <WebPageScreen onBack={back} url={screen.url} />;
  } else if (screen.kind === 'capabilities') {
    content = <CapabilitiesScreen onBack={back} />;
  } else {
    content = listScreen;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {content}
      <Modal
        animationType="fade"
        transparent
        visible={scanNotice !== null}
        onRequestClose={closeScanNotice}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialogCard} testID="scan-notice">
            <Text style={styles.dialogTitle}>
              {scanNotice?.kind === 'error' ? '无法扫码' : '扫码结果'}
            </Text>
            <Text
              style={styles.dialogText}
              selectable
              testID="scan-notice-text">
              {scanNotice?.text}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭扫码结果"
              onPress={closeScanNotice}
              style={({pressed}) => [
                styles.dialogButton,
                pressed && styles.pressed,
              ]}
              testID="scan-notice-close">
              <Text style={styles.dialogButtonText}>关闭</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // KMP paints both system bars white and only the page surface #F5F5F5;
    // the screens set their own background, so this colour only shows in the
    // status/navigation bar insets.
    backgroundColor: '#FFFFFF',
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 20,
    gap: 12,
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dialogText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textBody,
  },
  dialogButton: {
    alignSelf: 'flex-end',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  dialogButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.7,
  },
});

export default App;

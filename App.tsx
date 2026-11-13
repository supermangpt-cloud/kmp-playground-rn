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
 * @format
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, SafeAreaView, StatusBar, StyleSheet} from 'react-native';

import {findProduct} from './src/data/products';
import CartScreen from './src/screens/CartScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import ProductListScreen from './src/screens/ProductListScreen';
import {useCart} from './src/state/cart';

/** The page the app shows; mirrors the KMP build's `Screen` sealed class. */
export type Screen =
  | {kind: 'list'}
  | {kind: 'detail'; productId: string}
  | {kind: 'cart'};

const INITIAL_SCREEN: Screen = {kind: 'list'};

function App(): JSX.Element {
  const cart = useCart();
  // A stack instead of one value so back can pop detail/cart without special
  // cases; the last entry is the visible page.
  const [history, setHistory] = useState<Screen[]>([INITIAL_SCREEN]);
  const historyRef = useRef(history);
  historyRef.current = history;
  const screen = history[history.length - 1];

  const push = useCallback((next: Screen) => {
    setHistory(current => [...current, next]);
  }, []);
  const back = useCallback(() => {
    setHistory(current =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
  }, []);

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
  } else {
    content = listScreen;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});

export default App;

/**
 * Product list screen: the six catalogue products and the cart summary.
 *
 * The layout is the KMP build's `ui/ProductListScreen.kt`: a fixed header
 * (title row, one-line subtitle, three small entries, H5 result panel) and a
 * fixed bottom cart summary, with only the product rows scrolling between them.
 * Tapping a row opens the detail screen; the row's own 「加入购物车」 button adds
 * one unit, and the bottom summary's count/amount come from the cart reducer so
 * they change on the same render as the add.
 */
import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {formatPrice, Product, PRODUCTS} from '../data/products';
import {CartState} from '../state/cart';
import {colors} from '../ui/theme';
import ProductImage from '../ui/ProductImage';

type Props = {
  cart: CartState;
  onOpenProduct: (productId: string) => void;
  onOpenCart: () => void;
  onAddToCart: (productId: string) => void;
  onOpenQr: () => void;
  onOpenScan: () => void;
  onOpenWebPage: () => void;
  /** Opens the platform-capability list. Wired when that screen lands. */
  onOpenCapabilities?: () => void;
};

function ProductCard({
  product,
  onOpen,
  onAdd,
}: {
  product: Product;
  onOpen: () => void;
  onAdd: () => void;
}): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.title} 详情`}
      onPress={onOpen}
      style={({pressed}) => [styles.card, pressed && styles.pressed]}
      testID={`product-${product.id}`}>
      <ProductImage
        product={product}
        url={product.thumbnailUrl}
        style={styles.cardImage}
      />
      <View style={styles.cardText}>
        <Text numberOfLines={1} style={styles.productTitle}>
          {product.title}
        </Text>
        <Text style={styles.productPrice}>
          {formatPrice(product.priceYuan)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`把 ${product.title} 加入购物车`}
        onPress={onAdd}
        style={({pressed}) => [styles.addButton, pressed && styles.pressed]}
        testID={`add-${product.id}`}>
        <Text style={styles.addButtonText}>加入购物车</Text>
      </Pressable>
    </Pressable>
  );
}

/** One small outlined entry in the header, matching KMP's `EntryChip`. */
function EntryChip({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress?: () => void;
  testID: string;
}): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [styles.chip, pressed && styles.pressed]}
      testID={testID}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

/**
 * The H5 panel: the last page's result on the left and the open button on the
 * right. The result lines are filled in by a later step; until then the status
 * reads like the KMP build's initial "还没有打开过 H5 页面" state.
 */
function H5Panel({onOpen}: {onOpen: () => void}): JSX.Element {
  return (
    <View style={styles.h5Panel}>
      <View style={styles.h5Text}>
        <Text style={styles.h5Title}>H5 回传</Text>
        <Text style={styles.h5Status}>还没有打开过 H5 页面</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开 H5 演示页"
        onPress={onOpen}
        style={({pressed}) => [styles.h5Button, pressed && styles.pressed]}
        testID="h5-entry">
        <Text style={styles.h5ButtonText}>H5 演示</Text>
      </Pressable>
    </View>
  );
}

/**
 * The fixed bottom summary, matching KMP's `CartPanel` (without its per-item
 * rows): label, count, payable and amount, plus the empty-cart hint. The cart
 * page itself keeps the editable rows.
 */
function CartSummary({cart}: {cart: CartState}): JSX.Element {
  return (
    <View style={styles.cartPanel} testID="cart-summary">
      <View style={styles.cartRow}>
        <Text style={styles.cartLabel}>购物车</Text>
        <Text style={styles.cartCount} testID="cart-summary-count">
          {cart.count === 0 ? '还没有商品' : `${cart.count} 件商品`}
        </Text>
        <View style={styles.cartSpacer} />
        <Text style={styles.payableLabel}>应付</Text>
        <Text style={styles.payableAmount} testID="cart-summary-payable">
          {formatPrice(cart.totalYuan)}
        </Text>
      </View>
      {cart.count === 0 ? (
        <Text style={styles.cartEmpty} testID="cart-summary-empty">
          购物车还是空的，点商品的「加入购物车」
        </Text>
      ) : null}
    </View>
  );
}

export default function ProductListScreen({
  cart,
  onOpenProduct,
  onOpenCart,
  onAddToCart,
  onOpenQr,
  onOpenScan,
  onOpenWebPage,
  onOpenCapabilities,
}: Props): JSX.Element {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.heading}>商品列表</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`购物车，共 ${cart.count} 件`}
            onPress={onOpenCart}
            style={({pressed}) => [styles.cartBadge, pressed && styles.pressed]}
            testID="cart-badge">
            <Text style={styles.cartBadgeText}>购物车 {cart.count}</Text>
          </Pressable>
        </View>
        <Text style={styles.subheading}>
          点商品查看详情，点「加入购物车」更新下方合计
        </Text>
        <View style={styles.chipRow}>
          <EntryChip label="扫一扫" onPress={onOpenScan} testID="scan-entry" />
          <EntryChip label="二维码" onPress={onOpenQr} testID="qr-entry" />
          <EntryChip
            label="平台能力"
            onPress={onOpenCapabilities}
            testID="capabilities-entry"
          />
        </View>
      </View>
      <H5Panel onOpen={onOpenWebPage} />
      {/*
       * KMP's HarmonyOS list puts a 36dp ArkUI-interop row here (the light-blue
       * "这一行是 ArkUI 原生 Text" demo). RN has no ArkUI embed, but the row's
       * height is what places product row 1 at y=995 in the KMP dump, so keep
       * the slot as blank space instead of inventing a fake native row.
       */}
      <View style={styles.nativeSlot} />
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        testID="product-list">
        {PRODUCTS.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            onOpen={() => onOpenProduct(product.id)}
            onAdd={() => onAddToCart(product.id)}
          />
        ))}
      </ScrollView>
      <CartSummary cart={cart} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cartBadge: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  cartBadgeText: {
    fontSize: 13,
    letterSpacing: 0.3,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.surface,
  },
  subheading: {
    alignSelf: 'flex-start',
    marginTop: 4,
    fontSize: 13,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  chipRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chip: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.accent,
  },
  h5Panel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
  },
  h5Text: {
    flex: 1,
  },
  h5Title: {
    alignSelf: 'flex-start',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.textPrimary,
  },
  h5Status: {
    alignSelf: 'flex-start',
    fontSize: 12,
    lineHeight: 24,
    color: colors.textHint,
  },
  h5Button: {
    marginLeft: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  h5ButtonText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    color: colors.surface,
  },
  nativeSlot: {
    height: 36,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
  },
  cardImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  cardText: {
    flex: 1,
    paddingLeft: 14,
  },
  productTitle: {
    alignSelf: 'flex-start',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.textPrimary,
  },
  productPrice: {
    alignSelf: 'flex-start',
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.accent,
  },
  addButton: {
    marginLeft: 8,
    minHeight: 40,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  addButtonText: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '500',
    color: colors.surface,
  },
  cartPanel: {
    paddingTop: 12,
    paddingHorizontal: 16,
    // 8dp hint bottom margin + 12dp panel padding; the RN surface already
    // stops above the HarmonyOS gesture bar, like KMP's safeDrawingPadding.
    paddingBottom: 12,
    backgroundColor: colors.surface,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: -2},
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartLabel: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.textPrimary,
  },
  cartCount: {
    marginLeft: 8,
    fontSize: 13,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  cartSpacer: {
    flex: 1,
  },
  payableLabel: {
    fontSize: 13,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  payableAmount: {
    marginLeft: 6,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.accent,
  },
  cartEmpty: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'center',
    color: colors.textHint,
  },
  pressed: {
    opacity: 0.7,
  },
});

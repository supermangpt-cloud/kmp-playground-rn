/**
 * Product list screen: the six catalogue products and the cart entry.
 *
 * Tapping a card opens the detail screen; the card's own 「加入购物车」 button
 * adds one unit. The header shows the total unit count (`购物车 3`), which is
 * derived by the cart reducer, so it changes on the same render as the add.
 *
 * The header layout follows the KMP build's `ui/ProductListScreen.kt`: a title
 * row, a one-line subtitle, three small outlined entries (扫一扫 / 二维码 /
 * 平台能力) and the H5 result panel. The three entries used to be large cards
 * here; the KMP screen keeps them as 12sp chips on one right-aligned row.
 */
import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {formatPrice, Product, PRODUCTS} from '../data/products';
import {CartState} from '../state/cart';
import {colors} from '../ui/theme';

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
    <View style={styles.card} testID={`product-${product.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${product.title} 详情`}
        onPress={onOpen}
        style={styles.cardBody}
        testID={`open-${product.id}`}>
        <View style={styles.cardHeader}>
          <Text style={styles.productTitle}>{product.title}</Text>
          <Text style={styles.productPrice}>
            {formatPrice(product.priceYuan)}
          </Text>
        </View>
        <Text style={styles.productDescription}>{product.description}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onAdd}
        style={({pressed}) => [styles.addButton, pressed && styles.pressed]}
        testID={`add-${product.id}`}>
        <Text style={styles.addButtonText}>加入购物车</Text>
      </Pressable>
    </View>
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
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      testID="product-list">
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
      {PRODUCTS.map(product => (
        <ProductCard
          key={product.id}
          product={product}
          onOpen={() => onOpenProduct(product.id)}
          onAdd={() => onAddToCart(product.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 4,
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
  card: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  cardBody: {
    borderRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  productPrice: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.accent,
  },
  productDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  addButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});

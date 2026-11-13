/**
 * Product list screen: the six catalogue products and the cart entry.
 *
 * Tapping a card opens the detail screen; the card's own 「加入购物车」 button
 * adds one unit. The header shows the total unit count (`购物车 3`), which is
 * derived by the cart reducer, so it changes on the same render as the add.
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

export default function ProductListScreen({
  cart,
  onOpenProduct,
  onOpenCart,
  onAddToCart,
}: Props): JSX.Element {
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      testID="product-list">
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
      <Text style={styles.subheading}>KMP RN Demo · 共 6 件商品</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cartBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  cartBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },
  subheading: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 14,
    color: colors.textSecondary,
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

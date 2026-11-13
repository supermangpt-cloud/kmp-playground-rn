/**
 * Product detail screen: the full description of one catalogue product, a
 * back action and the same 「加入购物车」 action as the list row.
 */
import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {formatPrice, Product} from '../data/products';
import {colors} from '../ui/theme';

type Props = {
  product: Product;
  onBack: () => void;
  onAddToCart: (productId: string) => void;
};

export default function ProductDetailScreen({
  product,
  onBack,
  onAddToCart,
}: Props): JSX.Element {
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      testID="product-detail">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回列表"
        onPress={onBack}
        style={({pressed}) => [styles.backButton, pressed && styles.pressed]}
        testID="detail-back">
        <Text style={styles.backText}>← 返回列表</Text>
      </Pressable>
      <Text style={styles.title}>{product.title}</Text>
      <Text style={styles.price}>{formatPrice(product.priceYuan)}</Text>
      <View style={styles.divider} />
      <Text style={styles.description}>{product.description}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`把 ${product.title} 加入购物车`}
        onPress={() => onAddToCart(product.id)}
        style={({pressed}) => [styles.addButton, pressed && styles.pressed]}
        testID="detail-add">
        <Text style={styles.addButtonText}>加入购物车</Text>
      </Pressable>
      <Text style={styles.hint}>加入后可在列表顶部的「购物车」里调整数量</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  title: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  price: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
  },
  divider: {
    height: 1,
    marginVertical: 16,
    backgroundColor: colors.divider,
  },
  description: {
    fontSize: 15,
    lineHeight: 25,
    color: colors.textPrimary,
  },
  addButton: {
    marginTop: 28,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.surface,
  },
  hint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textHint,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});

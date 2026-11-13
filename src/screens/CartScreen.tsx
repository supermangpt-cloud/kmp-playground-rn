/**
 * Cart screen: one row per product with its unit price, quantity stepper and
 * subtotal, plus the running total at the bottom.
 *
 * `−` lowers the quantity; at 1 it removes the row (the reducer drops a row
 * whose quantity reaches zero). `+` adds one unit of the same product, so a
 * repeated add never creates a second row.
 */
import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {formatPrice} from '../data/products';
import {CartItem, CartState} from '../state/cart';
import {colors} from '../ui/theme';

type Props = {
  cart: CartState;
  onBack: () => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
};

function CartLine({
  item,
  onIncrement,
  onDecrement,
}: {
  item: CartItem;
  onIncrement: () => void;
  onDecrement: () => void;
}): JSX.Element {
  return (
    <View style={styles.line} testID={`cart-line-${item.productId}`}>
      <View style={styles.lineInfo}>
        <Text style={styles.lineTitle}>{item.title}</Text>
        <Text style={styles.lineUnit}>
          单价 {formatPrice(item.unitPriceYuan)}
        </Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`减少 ${item.title} 的数量`}
          onPress={onDecrement}
          style={({pressed}) => [styles.stepButton, pressed && styles.pressed]}
          testID={`cart-minus-${item.productId}`}>
          <Text style={styles.stepButtonText}>−</Text>
        </Pressable>
        <Text style={styles.quantity} testID={`cart-qty-${item.productId}`}>
          {item.qty}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`增加 ${item.title} 的数量`}
          onPress={onIncrement}
          style={({pressed}) => [styles.stepButton, pressed && styles.pressed]}
          testID={`cart-plus-${item.productId}`}>
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
      <View style={styles.subtotalBox}>
        <Text style={styles.subtotalLabel}>小计</Text>
        <Text
          style={styles.subtotal}
          testID={`cart-subtotal-${item.productId}`}>
          {formatPrice(item.unitPriceYuan * item.qty)}
        </Text>
      </View>
    </View>
  );
}

export default function CartScreen({
  cart,
  onBack,
  onIncrement,
  onDecrement,
}: Props): JSX.Element {
  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回列表"
          onPress={onBack}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}
          testID="cart-back">
          <Text style={styles.backText}>← 返回</Text>
        </Pressable>
        <Text style={styles.heading}>购物车</Text>
        <View style={styles.headerSpacer} />
      </View>
      {cart.items.length === 0 ? (
        <View style={styles.empty} testID="cart-empty">
          <Text style={styles.emptyTitle}>购物车还是空的</Text>
          <Text style={styles.emptyHint}>
            在商品列表点「加入购物车」开始挑选
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          testID="cart-list">
          {cart.items.map(item => (
            <CartLine
              key={item.productId}
              item={item}
              onIncrement={() => onIncrement(item.productId)}
              onDecrement={() => onDecrement(item.productId)}
            />
          ))}
        </ScrollView>
      )}
      <View style={styles.totalBar} testID="cart-total-bar">
        <Text style={styles.totalLabel}>合计</Text>
        <Text style={styles.totalCount}>共 {cart.count} 件</Text>
        <Text style={styles.totalAmount} testID="cart-total">
          {formatPrice(cart.totalYuan)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  heading: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 64,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  lineInfo: {
    flex: 1,
    marginRight: 8,
  },
  lineTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  lineUnit: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  stepButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  quantity: {
    minWidth: 30,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtotalBox: {
    marginLeft: 10,
    alignItems: 'flex-end',
  },
  subtotalLabel: {
    fontSize: 11,
    color: colors.textHint,
  },
  subtotal: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptyHint: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  totalCount: {
    marginLeft: 8,
    fontSize: 12,
    color: colors.textSecondary,
  },
  totalAmount: {
    flex: 1,
    textAlign: 'right',
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});

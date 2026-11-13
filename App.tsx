/**
 * First React Native screen: the product list.
 *
 * The six entries mirror the KMP catalogue (id/title/price/description) so the
 * three apps show the same data. Images are intentionally left out for now.
 *
 * @format
 */

import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type Product = {
  id: string;
  title: string;
  price: string;
  description: string;
};

export const PRODUCTS: Product[] = [
  {
    id: 'p-001',
    title: '无线降噪耳机',
    price: '¥899',
    description:
      '40 小时超长续航，支持主动降噪与通透模式。轻量的头梁设计，长时间佩戴也不会夹耳。',
  },
  {
    id: 'p-002',
    title: '机械键盘',
    price: '¥499',
    description:
      '87 键紧凑布局，热插拔轴体，支持有线、蓝牙与 2.4G 三模连接。原厂 PBT 键帽，敲击手感干脆利落。',
  },
  {
    id: 'p-003',
    title: '智能手表',
    price: '¥1299',
    description:
      '1.43 英寸 AMOLED 屏幕，支持心率、血氧与睡眠监测。内置 GPS，典型使用场景下满电可用 14 天。',
  },
  {
    id: 'p-004',
    title: '便携蓝牙音箱',
    price: '¥299',
    description:
      '360 度环绕声场，IPX7 级防水。单次充电可连续播放 18 小时，是户外露营的好搭档。',
  },
  {
    id: 'p-005',
    title: '护眼桌面台灯',
    price: '¥199',
    description:
      '无频闪直流调光，色温从 2700K 到 6500K 无级可调。铝合金灯臂，支持多角度自由悬停。',
  },
  {
    id: 'p-006',
    title: '不锈钢保温杯',
    price: '¥129',
    description:
      '316 不锈钢内胆，真空双层锁温。500ml 容量，保温 12 小时、保冷 24 小时。',
  },
];

function ProductCard({product}: {product: Product}): JSX.Element {
  return (
    <View style={styles.card} testID={`product-${product.id}`}>
      <View style={styles.cardHeader}>
        <Text style={styles.productTitle}>{product.title}</Text>
        <Text style={styles.productPrice}>{product.price}</Text>
      </View>
      <Text style={styles.productDescription}>{product.description}</Text>
    </View>
  );
}

function App(): JSX.Element {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        testID="product-list">
        <Text style={styles.heading}>商品列表</Text>
        <Text style={styles.subheading}>KMP RN Demo · 共 6 件商品</Text>
        {PRODUCTS.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#212121',
  },
  subheading: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 14,
    color: '#757575',
  },
  card: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
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
    color: '#212121',
  },
  productPrice: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2563EB',
  },
  productDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#757575',
  },
});

export default App;

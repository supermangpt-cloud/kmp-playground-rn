/**
 * The six-product catalogue, ported from the KMP shared module
 * (`shared/src/commonMain/kotlin/com/example/kmp/Product.kt`).
 *
 * Like the KMP `Product`, the machine-readable price is an integer number of
 * yuan (`priceYuan`); the UI formats it with [formatPrice]. The cart totals are
 * computed from `priceYuan` and never from parsing the display string.
 *
 * [imageName] names the bundled offline image (also the load-error fallback);
 * [imageUrl] / [thumbnailUrl] are the KMP build's network photos, reused here
 * verbatim so both apps show the same picture. The list uses the thumbnail and
 * the detail page the large image.
 */
export type Product = {
  id: string;
  title: string;
  priceYuan: number;
  description: string;
  imageName: string;
  imageUrl: string;
  thumbnailUrl: string;
};

export const PRODUCTS: Product[] = [
  {
    id: 'p-001',
    title: '无线降噪耳机',
    priceYuan: 899,
    description:
      '40 小时超长续航，支持主动降噪与通透模式。轻量的头梁设计，长时间佩戴也不会夹耳。',
    imageName: 'product_headphones',
    imageUrl: 'https://picsum.photos/id/1/600/600.jpg',
    thumbnailUrl: 'https://picsum.photos/id/1/200/200.jpg',
  },
  {
    id: 'p-002',
    title: '机械键盘',
    priceYuan: 499,
    description:
      '87 键紧凑布局，热插拔轴体，支持有线、蓝牙与 2.4G 三模连接。原厂 PBT 键帽，敲击手感干脆利落。',
    imageName: 'product_keyboard',
    imageUrl: 'https://picsum.photos/id/403/600/600.jpg',
    thumbnailUrl: 'https://picsum.photos/id/403/200/200.jpg',
  },
  {
    id: 'p-003',
    title: '智能手表',
    priceYuan: 1299,
    description:
      '1.43 英寸 AMOLED 屏幕，支持心率、血氧与睡眠监测。内置 GPS，典型使用场景下满电可用 14 天。',
    imageName: 'product_watch',
    imageUrl: 'https://picsum.photos/id/160/600/600.jpg',
    thumbnailUrl: 'https://picsum.photos/id/160/200/200.jpg',
  },
  {
    id: 'p-004',
    title: '便携蓝牙音箱',
    priceYuan: 299,
    description:
      '360 度环绕声场，IPX7 级防水。单次充电可连续播放 18 小时，是户外露营的好搭档。',
    imageName: 'product_speaker',
    imageUrl: 'https://picsum.photos/id/250/600/600.jpg',
    thumbnailUrl: 'https://picsum.photos/id/250/200/200.jpg',
  },
  {
    id: 'p-005',
    title: '护眼桌面台灯',
    priceYuan: 199,
    description:
      '无频闪直流调光，色温从 2700K 到 6500K 无级可调。铝合金灯臂，支持多角度自由悬停。',
    imageName: 'product_lamp',
    imageUrl: 'https://picsum.photos/id/201/600/600.jpg',
    thumbnailUrl: 'https://picsum.photos/id/201/200/200.jpg',
  },
  {
    id: 'p-006',
    title: '不锈钢保温杯',
    priceYuan: 129,
    description:
      '316 不锈钢内胆，真空双层锁温。500ml 容量，保温 12 小时、保冷 24 小时。',
    imageName: 'product_bottle',
    imageUrl: 'https://picsum.photos/id/225/600/600.jpg',
    thumbnailUrl: 'https://picsum.photos/id/225/200/200.jpg',
  },
];

/** Look a product up by id; `undefined` for an id that is not in the catalogue. */
export function findProduct(productId: string): Product | undefined {
  return PRODUCTS.find(product => product.id === productId);
}

/** Display label for a yuan amount, for example `¥899`. */
export function formatPrice(priceYuan: number): string {
  return `¥${priceYuan}`;
}

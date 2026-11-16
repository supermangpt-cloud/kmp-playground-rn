/**
 * The six bundled product photos, copied from the KMP build's
 * `composeResources/drawable/product_*.png`.
 *
 * They are the offline placeholder and the fallback shown when the network
 * photo fails to load, exactly like KMP's `ProductImage.kt`. Metro needs static
 * `require` paths, so the map is written out instead of built from
 * `product.imageName`.
 */
import {ImageSourcePropType} from 'react-native';

export const BUNDLED_PRODUCT_IMAGES: Record<string, ImageSourcePropType> = {
  product_headphones: require('../assets/products/product_headphones.png'),
  product_keyboard: require('../assets/products/product_keyboard.png'),
  product_watch: require('../assets/products/product_watch.png'),
  product_speaker: require('../assets/products/product_speaker.png'),
  product_lamp: require('../assets/products/product_lamp.png'),
  product_bottle: require('../assets/products/product_bottle.png'),
};

/** The bundled image for a product, or undefined if the catalogue is stale. */
export function bundledProductImage(
  imageName: string,
): ImageSourcePropType | undefined {
  return BUNDLED_PRODUCT_IMAGES[imageName];
}

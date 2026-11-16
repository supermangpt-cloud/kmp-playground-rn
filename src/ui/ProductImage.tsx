/**
 * A product photo loaded from the KMP build's network URL, with the bundled
 * image underneath as the placeholder and the load-error fallback (KMP's
 * `ProductImage.kt` passes the bundled drawable as Coil's placeholder, error
 * and fallback painter).
 *
 * The bundled photo is painted first, so a card is never blank: while the
 * network request runs it is the placeholder, and if the request fails the
 * bundled photo simply stays. The network image fades in on top once it has
 * loaded.
 *
 * A grey frame sits behind both; it is only visible if a catalogue entry has no
 * bundled image.
 *
 * Why not a grey block while loading: on the HarmonyOS device the image loader
 * does not call `onError` when the network is down (the request just hangs), so
 * a grey loading state would be the permanent offline state. KMP's bundled
 * placeholder is what keeps the offline screen correct.
 */
import React, {useEffect, useState} from 'react';
import {Image, ImageStyle, StyleProp, StyleSheet, View} from 'react-native';

import {bundledProductImage} from '../data/productImages';
import {Product} from '../data/products';
import {colors} from './theme';

type Props = {
  product: Product;
  /** Network URL: `thumbnailUrl` in the list, `imageUrl` on the detail page. */
  url: string;
  style?: StyleProp<ImageStyle>;
};

export default function ProductImage({
  product,
  url,
  style,
}: Props): JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const bundled = bundledProductImage(product.imageName);

  // A new URL means a fresh attempt; while it loads the bundled photo shows
  // again instead of the previous product's picture.
  useEffect(() => {
    setLoaded(false);
  }, [url]);

  return (
    <View style={[styles.frame, style]}>
      {bundled !== undefined ? (
        <Image
          accessibilityLabel={product.title}
          resizeMode="cover"
          source={bundled}
          style={styles.image}
          testID={`product-image-fallback-${product.id}`}
        />
      ) : null}
      <Image
        accessibilityLabel={product.title}
        onError={() => setLoaded(false)}
        onLoad={() => setLoaded(true)}
        resizeMode="cover"
        source={{uri: url}}
        style={[styles.image, styles.network, !loaded && styles.loading]}
        testID={`product-image-${product.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.imagePlaceholder,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  network: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  loading: {
    opacity: 0,
  },
});

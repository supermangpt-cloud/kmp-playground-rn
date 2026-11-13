import type { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony';

/**
 * Third-party RN packages linked into the app. The product list only uses the
 * RNOH core package and built-in React Native modules, so the list stays empty.
 * A library with native code would add its package here (and in
 * PackageProvider.cpp).
 */
export function getRNOHPackages(ctx: RNPackageContext): RNPackage[] {
  return [];
}

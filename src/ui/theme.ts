/**
 * Shared colour tokens for every screen.
 *
 * They are the KMP Compose theme's `DemoColors` (`ui/Theme.kt`), unchanged:
 * light background, white cards/sheets, the orange accent for prices and
 * primary actions, and the same text greys.
 */
export const colors = {
  background: '#F5F5F5',
  surface: '#FFFFFF',
  cartLine: '#FAFAFA',
  imagePlaceholder: '#EEEEEE',
  divider: '#EEEEEE',
  textPrimary: '#212121',
  textBody: '#424242',
  textSecondary: '#757575',
  textHint: '#9E9E9E',
  textFaint: '#BDBDBD',
  accent: '#EF6C00',
  accentSoft: '#FFF3E0',
  discount: '#2E7D32',
  delete: '#C62828',
} as const;

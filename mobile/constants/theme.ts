// mobile/constants/theme.ts
/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const DEFAULT_TINT_COLOR = '#7c96ec'; // '#1D9BF0';

function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  const hex = raw.startsWith('#') ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return hex.toLowerCase();
}

/**
 * Overrides the app accent/tint color at runtime.
 * Intended for hidden/feature-flag style settings (e.g. paywalled customization).
 */
export function setCustomTintColor(customTheme: unknown) {
  const next = normalizeHexColor(customTheme) ?? DEFAULT_TINT_COLOR;
  Colors.light.tint = next;
  Colors.dark.tint = next;
  Colors.light.tabIconSelected = next;
  Colors.dark.tabIconSelected = next;
}

export const Colors = {
  light: {
    text: '#0F1419',
    background: '#FFFFFF',
    tint: DEFAULT_TINT_COLOR,
    icon: '#536471',
    tabIconDefault: '#536471',
    tabIconSelected: DEFAULT_TINT_COLOR,

    surface: '#FFFFFF',
    card: '#FFFFFF',
    message: '#E5E5EA',
    border: '#d4d7d8',

    textSecondary: '#536471',
    textMuted: '#8B98A5',

    pressed: 'rgba(15,20,25,0.06)',
    modalBackdrop: 'rgba(0,0,0,0.45)',
  },

  dark: {
    text: '#E7E9EA',
    background: '#000000',
    tint: DEFAULT_TINT_COLOR,
    icon: '#71767B',
    tabIconDefault: '#71767B',
    tabIconSelected: DEFAULT_TINT_COLOR,

    surface: '#121214',
    card: '#121214',
    message: '#2F3336',
    border: '#2F3336',

    textSecondary: '#71767B',
    textMuted: '#71767B',

    pressed: 'rgba(231,233,234,0.08)',
    modalBackdrop: 'rgba(0,0,0,0.62)',
  },
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

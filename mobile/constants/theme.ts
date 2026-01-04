// mobile/constants/theme.ts
/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColor = '#1D9BF0';

export const Colors = {
  light: {
    text: '#0F1419',
    background: '#FFFFFF',
    tint: tintColor,
    icon: '#536471',
    tabIconDefault: '#536471',
    tabIconSelected: tintColor,

    surface: '#FFFFFF',
    card: '#FFFFFF',
    border: '#d4d7d8',

    textSecondary: '#536471',
    textMuted: '#8B98A5',

    pressed: 'rgba(15,20,25,0.06)',
    modalBackdrop: 'rgba(0,0,0,0.45)',
  },

  dark: {
    text: '#E7E9EA',
    background: '#000000',
    tint: tintColor,
    icon: '#71767B',
    tabIconDefault: '#71767B',
    tabIconSelected: tintColor,

    surface: '#121214',
    card: '#121214',
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

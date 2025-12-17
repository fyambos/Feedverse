import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { Colors } from './theme';

export const NavLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.light.background,
    card: Colors.light.card, 
    border: Colors.light.border,
    text: Colors.light.text,
  },
};

export const NavDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.card, 
    border: Colors.dark.border,
    text: Colors.dark.text,
  },
};
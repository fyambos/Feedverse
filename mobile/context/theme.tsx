import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

export type DarkMode = "light" | "dark" | "system";

type ThemeContextValue = {
  mode: DarkMode;
  scheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  scheme: "light",
});

export function ThemeProvider({
  mode,
  children,
}: {
  mode: DarkMode;
  children: React.ReactNode;
}) {
    
  const system = (useSystemColorScheme() ?? "light") as "light" | "dark";

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: "light" | "dark" = mode === "system" ? system : mode;
    return { mode, scheme };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
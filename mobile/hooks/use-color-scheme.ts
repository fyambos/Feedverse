import { useTheme } from "@/context/theme";
export function useColorScheme() {
  const { scheme } = useTheme();
  return scheme;
}
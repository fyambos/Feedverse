import { useMemo } from "react";
import type { UserSettings } from "@/data/db/schema";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const DEFAULT_SETTINGS: Required<UserSettings> = {
  showTimestamps: true,
  darkMode: "system",
};

export function useUserSettings(): Required<UserSettings> {
  const user = useCurrentUser();

  return useMemo(() => {
    const s = user?.settings ?? {};
    return {
      showTimestamps: s.showTimestamps ?? DEFAULT_SETTINGS.showTimestamps,
      darkMode: s.darkMode ?? DEFAULT_SETTINGS.darkMode,
    };
  }, [user?.settings]);
}
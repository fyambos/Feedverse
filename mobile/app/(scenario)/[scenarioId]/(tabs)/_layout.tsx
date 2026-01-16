// mobile/app/(scenario)/[scenarioId]/(tabs)/_layout.tsx
import React, { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { Tabs, router, useLocalSearchParams, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppData } from "@/context/appData";
import { useAuth } from "@/context/auth";

function TabIcon({
  iosName,
  androidIonicon,
  color,
  size = 28,
}: {
  iosName: string;
  androidIonicon: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
}) {
  if (Platform.OS === "ios") {
    return <IconSymbol size={size} name={iosName as any} color={color} />;
  }
  return <Ionicons name={androidIonicon} size={size} color={color} />;
}

function scenarioIdFromPathname(pathname: string): string {
  const parts = pathname
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  // Typical shapes:
  // - /(scenario)/demo-kpop/(tabs)/home
  // - /demo-kpop/home (depending on router config)
  const scenarioIdx = parts.findIndex((p) => p === "(scenario)" || p === "scenario");
  const candidate =
    scenarioIdx >= 0
      ? parts[scenarioIdx + 1]
      : parts.length > 0
      ? parts[0]
      : "";

  const raw = String(candidate ?? "").trim();
  if (!raw) return "";
  if (raw === "modal") return "";
  if (raw.startsWith("(")) return ""; // route group

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function TabLayout() {
  const pathname = usePathname();
  const params = useLocalSearchParams<{ scenarioId?: string }>();

  const gateRanRef = React.useRef<string | null>(null);
  const lastSidRef = React.useRef<string>("");

  const sid = useMemo(() => {
    // IMPORTANT: Prefer the pathname-derived scenarioId.
    // In some navigation flows (notably notification-driven pushes/replaces),
    // `useLocalSearchParams()` can temporarily reflect a stale scenarioId from
    // the previous scenario. The URL/pathname is the source of truth.

    if (pathname.startsWith("/modal")) {
      return lastSidRef.current;
    }

    const fromPath = scenarioIdFromPathname(pathname);
    if (fromPath) {
      lastSidRef.current = fromPath;
      return fromPath;
    }

    const fromParams = typeof params?.scenarioId === "string" ? params.scenarioId.trim() : "";
    if (fromParams) {
      lastSidRef.current = fromParams;
      return fromParams;
    }

    return lastSidRef.current;
  }, [params?.scenarioId, pathname]);

  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const { userId } = useAuth();
  const app = useAppData() as any;
  const { isReady, db, getSelectedProfileId } = app;

  const seedKey = useMemo(() => String((db as any)?.seededAt ?? ""), [db]);

  const selectedProfileId = useMemo(
    () => (sid ? getSelectedProfileId?.(sid) ?? null : null),
    [getSelectedProfileId, sid]
  );

  // ---- GATE: force create/select profile when entering a scenario ----
  useEffect(() => {
    if (!isReady) return;
    if (!sid) return;

    // do NOT gate while a modal is open
    if (pathname.startsWith("/modal")) return;

    // run ONCE per scenario seed (re-run after reseed)
    const gateKey = `${sid}|${seedKey}`;
    if (gateRanRef.current === gateKey) return;

    if (selectedProfileId) {
      gateRanRef.current = gateKey;
      return;
    }

    const uid = String(userId ?? "").trim();
    const profilesMap = (db as any)?.profiles ?? {};

    const hasAnyProfileInScenario = Object.values(profilesMap).some((p: any) => {
      return String(p?.scenarioId) === sid && String(p?.ownerUserId) === uid;
    });

    gateRanRef.current = gateKey; // lock BEFORE navigating

    if (hasAnyProfileInScenario) {
      router.replace({
        pathname: "/modal/select-profile",
        params: { scenarioId: sid, forced: "1" },
      } as any);
    } else {
      router.replace({
        pathname: "/modal/create-profile",
        params: { scenarioId: sid, mode: "create", forced: "1" },
      } as any);
    }
  }, [isReady, sid, seedKey, selectedProfileId, userId, db, pathname]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "",
          href: sid
            ? ({
                pathname: "/(scenario)/[scenarioId]/(tabs)/home",
                params: { scenarioId: sid },
              } as any)
            : undefined,
          tabBarIcon: ({ color }) => (
            <TabIcon iosName="house.fill" androidIonicon="home" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: "",
          href: sid
            ? ({
                pathname: "/(scenario)/[scenarioId]/(tabs)/search",
                params: { scenarioId: sid },
              } as any)
            : undefined,
          tabBarIcon: ({ color }) => (
            <TabIcon iosName="magnifyingglass" androidIonicon="search" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: "",
          href: sid
            ? ({
                pathname: "/(scenario)/[scenarioId]/(tabs)/notifications",
                params: { scenarioId: sid },
              } as any)
            : undefined,
          tabBarIcon: ({ color }) => (
            <TabIcon iosName="bell.fill" androidIonicon="notifications" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: "",
          href: sid
            ? ({
                pathname: "/(scenario)/[scenarioId]/(tabs)/messages",
                params: { scenarioId: sid },
              } as any)
            : undefined,
          tabBarIcon: ({ color }) => (
            <TabIcon iosName="envelope.fill" androidIonicon="mail" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
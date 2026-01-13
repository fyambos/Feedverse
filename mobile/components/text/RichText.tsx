import React from "react";
import { Text, Linking, type TextStyle } from "react-native";
import { router } from "expo-router";

import { useAppData } from "@/context/appData";

type TextPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string }
  | { type: "mention"; value: string }
  | { type: "hashtag"; value: string };

function parseRichText(text: string): TextPart[] {
  // Order matters: mention/hashtag/link
  const regex = /(@[a-zA-Z0-9_]+)|(#[a-zA-Z0-9_]+)|(https?:\/\/[^\s]+)/g;
  const parts: TextPart[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) parts.push({ type: "mention", value: match[1] });
    else if (match[2]) parts.push({ type: "hashtag", value: match[2] });
    else if (match[3]) parts.push({ type: "link", value: match[3] });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts;
}

function normalizeHandle(input: string) {
  return String(input ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export function RichText({
  scenarioId,
  text,
  colors,
  style,
  linkColor,
  mentionColor,
  onPressHashtag,
}: {
  scenarioId: string;
  text: string;
  colors: { text: string; tint: string };
  style?: TextStyle | TextStyle[];
  linkColor?: string;
  mentionColor?: string;
  onPressHashtag?: (tag: string) => void;
}) {
  const app = useAppData() as any;

  const sid = String(scenarioId ?? "");
  const rawText = String(text ?? "");

  const effectiveLinkColor = String(linkColor ?? colors.tint);
  const effectiveMentionColor = String(mentionColor ?? colors.tint);

  const goToMention = (raw: string) => {
    const handle = normalizeHandle(raw);
    if (!sid || !handle) return;

    const p = app?.getProfileByHandle?.(sid, handle) ?? null;
    if (p?.id) {
      router.push({
        pathname: "/(scenario)/[scenarioId]/(tabs)/home/profile/[profileId]",
        params: { scenarioId: sid, profileId: String(p.id) },
      } as any);
      return;
    }

    router.push({
      pathname: "/(scenario)/[scenarioId]/(tabs)/home/user-not-found",
      params: { scenarioId: sid, handle },
    } as any);
  };

  const goToHashtag = (raw: string) => {
    const tag = String(raw ?? "").trim().replace(/^#+/, "");
    if (!tag) return;

    if (onPressHashtag) {
      onPressHashtag(tag);
      return;
    }

    router.push({
      pathname: `/(scenario)/${encodeURIComponent(sid)}/(tabs)/search`,
      params: { q: `#${tag}` },
    } as any);
  };

  const openLink = async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
    } catch {
      // ignore
    }
  };

  return (
    <Text style={style}>
      {parseRichText(rawText).map((part, i) => {
        if (part.type === "link") {
          return (
            <Text
              key={`l-${i}`}
              style={{ color: effectiveLinkColor, textDecorationLine: "none" }}
              onPress={() => openLink(part.value)}
            >
              {part.value}
            </Text>
          );
        }

        if (part.type === "mention") {
          return (
            <Text
              key={`m-${i}`}
              style={{ color: effectiveMentionColor, textDecorationLine: "none", fontWeight: "800" }}
              onPress={() => goToMention(part.value)}
            >
              {part.value}
            </Text>
          );
        }

        if (part.type === "hashtag") {
          return (
            <Text
              key={`h-${i}`}
              style={{ color: effectiveLinkColor, textDecorationLine: "none" }}
              onPress={() => goToHashtag(part.value)}
            >
              {part.value}
            </Text>
          );
        }

        return (
          <Text key={`t-${i}`} style={{ color: colors.text }}>
            {part.value}
          </Text>
        );
      })}
    </Text>
  );
}

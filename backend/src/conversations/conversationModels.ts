// backend/src/conversations/conversationModels.ts

export type ConversationRow = {
  id: string;
  scenario_id: string;
  title: string | null;
  avatar_url: string | null;
  participant_profile_ids: string[];
  created_at: Date | string;
  updated_at: Date | string | null;
  last_message_at: Date | string | null;
  last_message_text?: string | null;
  last_message_kind?: string | null;
  last_message_sender_profile_id?: string | null;
};

export type ConversationApi = {
  id: string;
  scenarioId: string;
  participantProfileIds: string[];
  title?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
  lastMessageText?: string;
  lastMessageKind?: string;
  lastMessageSenderProfileId?: string;
};

function toIso(v: Date | string | null | undefined): string | undefined {
  if (v == null) return undefined;
  try {
    return new Date(v).toISOString();
  } catch {
    return undefined;
  }
}

export function mapConversationRowToApi(row: ConversationRow): ConversationApi {
  const createdAt = toIso(row.created_at) ?? new Date().toISOString();
  const updatedAt = toIso(row.updated_at);
  const lastMessageAt = toIso(row.last_message_at);

  const lastMessageTextRaw = (row as any).last_message_text;
  const lastMessageKindRaw = (row as any).last_message_kind;
  const lastMessageSenderProfileIdRaw = (row as any).last_message_sender_profile_id;

  const lastMessageText = lastMessageTextRaw != null ? String(lastMessageTextRaw) : undefined;
  const lastMessageKind = lastMessageKindRaw != null ? String(lastMessageKindRaw) : undefined;
  const lastMessageSenderProfileId =
    lastMessageSenderProfileIdRaw != null ? String(lastMessageSenderProfileIdRaw) : undefined;

  return {
    id: String(row.id),
    scenarioId: String(row.scenario_id),
    participantProfileIds: Array.isArray(row.participant_profile_ids)
      ? row.participant_profile_ids.map(String).filter(Boolean)
      : [],
    title: row.title != null ? String(row.title) : undefined,
    avatarUrl: row.avatar_url != null ? String(row.avatar_url) : undefined,
    createdAt,
    updatedAt,
    lastMessageAt,
    lastMessageText,
    lastMessageKind,
    lastMessageSenderProfileId,
  };
}

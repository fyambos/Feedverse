// mobile/mocks/messages.ts
import type { Conversation, Message } from "@/data/db/schema";

// NOTE: Conversation IDs follow the same deterministic pattern as AppData's makeConversationId:
// `c_${scenarioId}_${sortedParticipantIds.join("_")}`

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "c_demo-kpop_pr_kpop_jinnie_pr_kpop_winter",
    scenarioId: "demo-kpop",
    participantProfileIds: ["pr_kpop_jinnie", "pr_kpop_winter"],
    createdAt: "2025-12-20T09:30:00.000Z",
    updatedAt: "2025-12-20T09:35:00.000Z",
    lastMessageAt: "2025-12-20T09:35:00.000Z",
  },
  {
    id: "c_demo-kpop_pr_kpop_jisung_pr_kpop_solar_pr_kpop_winter",
    scenarioId: "demo-kpop",
    participantProfileIds: ["pr_kpop_jisung", "pr_kpop_solar", "pr_kpop_winter"],
    createdAt: "2025-12-21T12:10:00.000Z",
    updatedAt: "2025-12-21T12:22:00.000Z",
    lastMessageAt: "2025-12-21T12:22:00.000Z",
  },
  {
    id: "c_demo-mafia_pr_mafia_boss_pr_mafia_driver",
    scenarioId: "demo-mafia",
    participantProfileIds: ["pr_mafia_boss", "pr_mafia_driver"],
    createdAt: "2025-11-02T19:00:00.000Z",
    updatedAt: "2025-11-02T19:09:00.000Z",
    lastMessageAt: "2025-11-02T19:09:00.000Z",
  },
];

export const MOCK_MESSAGES: Message[] = [
  // demo-kpop 1:1 (jinnie <-> winter)
  {
    id: "dm_kpop_1_m1",
    scenarioId: "demo-kpop",
    conversationId: "c_demo-kpop_pr_kpop_jinnie_pr_kpop_winter",
    senderProfileId: "pr_kpop_jinnie",
    text: "do you still have that lab notebook?",
    createdAt: "2025-12-20T09:31:00.000Z",
  },
  {
    id: "dm_kpop_1_m2",
    scenarioId: "demo-kpop",
    conversationId: "c_demo-kpop_pr_kpop_jinnie_pr_kpop_winter",
    senderProfileId: "pr_kpop_winter",
    text: "yes. i rescued it from the chaos pile.",
    createdAt: "2025-12-20T09:32:10.000Z",
  },
  {
    id: "dm_kpop_1_m3",
    scenarioId: "demo-kpop",
    conversationId: "c_demo-kpop_pr_kpop_jinnie_pr_kpop_winter",
    senderProfileId: "pr_kpop_jinnie",
    text: "hero behavior. can i borrow it after class?",
    createdAt: "2025-12-20T09:33:40.000Z",
  },
  {
    id: "dm_kpop_1_m4",
    scenarioId: "demo-kpop",
    conversationId: "c_demo-kpop_pr_kpop_jinnie_pr_kpop_winter",
    senderProfileId: "pr_kpop_winter",
    text: "sure. i’ll bring it. also: coffee bribe accepted.",
    createdAt: "2025-12-20T09:35:00.000Z",
  },

  // demo-kpop group (jisung, solar, winter)
  {
    id: "dm_kpop_g_m1",
    scenarioId: "demo-kpop",
    conversationId: "c_demo-kpop_pr_kpop_jisung_pr_kpop_solar_pr_kpop_winter",
    senderProfileId: "pr_kpop_jisung",
    text: "group chat name suggestions: 'sleep deprived legends'",
    createdAt: "2025-12-21T12:11:00.000Z",
  },
  {
    id: "dm_kpop_g_m2",
    scenarioId: "demo-kpop",
    conversationId: "c_demo-kpop_pr_kpop_jisung_pr_kpop_solar_pr_kpop_winter",
    senderProfileId: "pr_kpop_solar",
    text: "counterpoint: 'we are fine (lying)'",
    createdAt: "2025-12-21T12:12:30.000Z",
  },
  {
    id: "dm_kpop_g_m3",
    scenarioId: "demo-kpop",
    conversationId: "c_demo-kpop_pr_kpop_jisung_pr_kpop_solar_pr_kpop_winter",
    senderProfileId: "pr_kpop_winter",
    text: "i vote for silence.",
    createdAt: "2025-12-21T12:13:10.000Z",
  },
  {
    id: "dm_kpop_g_m4",
    scenarioId: "demo-kpop",
    conversationId: "c_demo-kpop_pr_kpop_jisung_pr_kpop_solar_pr_kpop_winter",
    senderProfileId: "pr_kpop_solar",
    text: "silence is not a name, winter.",
    createdAt: "2025-12-21T12:22:00.000Z",
  },

  // demo-mafia 1:1
  {
    id: "dm_mafia_1_m1",
    scenarioId: "demo-mafia",
    conversationId: "c_demo-mafia_pr_mafia_boss_pr_mafia_driver",
    senderProfileId: "pr_mafia_boss",
    text: "need a ride. unmarked car.",
    createdAt: "2025-11-02T19:01:00.000Z",
  },
  {
    id: "dm_mafia_1_m2",
    scenarioId: "demo-mafia",
    conversationId: "c_demo-mafia_pr_mafia_boss_pr_mafia_driver",
    senderProfileId: "pr_mafia_driver",
    text: "location?",
    createdAt: "2025-11-02T19:02:00.000Z",
  },
  {
    id: "dm_mafia_1_m3",
    scenarioId: "demo-mafia",
    conversationId: "c_demo-mafia_pr_mafia_boss_pr_mafia_driver",
    senderProfileId: "pr_mafia_boss",
    text: "same place. five minutes.",
    createdAt: "2025-11-02T19:09:00.000Z",
  },
];

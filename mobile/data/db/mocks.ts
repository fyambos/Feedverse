// mobile/data/db/mocks.ts
import { v4 as uuidv4 } from "uuid";

// Generate a random UUID
function generateId() {
  return uuidv4();
}

// --- SCENARIOS ---
export const mockScenarios = [
  {
    id: "scenario-1",
    name: "Wild West Adventure",
    cover: "https://example.com/cover1.jpg",
    inviteCode: "JOIN-WEST",
    playerIds: ["user-1", "user-2"],
    ownerUserId: "user-1",
    createdAt: 1672531199000,
    updatedAt: 1672531199000,
    mode: "story",
  },
  {
    id: "scenario-2",
    name: "Space Odyssey",
    cover: "https://example.com/cover2.jpg",
    inviteCode: "JOIN-SPACE",
    playerIds: ["user-2", "user-3"],
    ownerUserId: "user-2",
    createdAt: 1672617599000,
    updatedAt: 1672617599000,
    mode: "campaign",
  },
];

// --- PROFILES ---
export const mockProfiles = {
  "user-1": {
    id: "user-1",
    name: "Alice",
    avatarUrl: "https://example.com/avatar1.jpg",
    scenarioId: "scenario-1",
    ownerUserId: "user-1",
    createdAt: 1672531199000,
    updatedAt: 1672531199000,
  },
  "user-2": {
    id: "user-2",
    name: "Bob",
    avatarUrl: "https://example.com/avatar2.jpg",
    scenarioId: "scenario-1",
    ownerUserId: "user-1",
    createdAt: 1672531199000,
    updatedAt: 1672531199000,
  },
  "user-3": {
    id: "user-3",
    name: "Charlie",
    avatarUrl: "https://example.com/avatar3.jpg",
    scenarioId: "scenario-2",
    ownerUserId: "user-2",
    createdAt: 1672617599000,
    updatedAt: 1672617599000,
  },
};

// --- LIKES ---
export const mockLikes = {
  // [`${profileId}:${postId}`]: { id, scenarioId, profileId, postId, createdAt }
};

// --- MESSAGES ---
export const mockMessages = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-1",
    recipientId: "user-2",
    content: "Howdy, partner!",
    createdAt: 1672531199000,
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    senderId: "user-2",
    recipientId: "user-1",
    content: "Hello, Alice! Ready for the adventure?",
    createdAt: 1672531250000,
  },
];

// --- CONVERSATIONS ---
export const mockConversations = [
  {
    id: "conv-1",
    participantIds: ["user-1", "user-2"],
    lastMessageId: "msg-2",
    updatedAt: 1672531250000,
  },
];

// --- NOTIFICATIONS ---
export const mockNotifications = [
  {
    id: "notif-1",
    recipientId: "user-1",
    senderId: "user-2",
    type: "mention",
    content: "Bob mentioned you in a comment.",
    isRead: false,
    createdAt: 1672531199000,
  },
];

// --- SCENARIO TEMPLATES ---
export const mockScenarioTemplates = [
  {
    id: "template-1",
    name: "Treasure Hunt",
    description: "A thrilling treasure hunt adventure.",
    cover: "https://example.com/template-cover1.jpg",
    createdAt: 1672531199000,
    updatedAt: 1672531199000,
  },
];
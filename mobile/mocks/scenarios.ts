// mocks/scenarios.ts
import type { Scenario } from "@/data/db/schema";

export const MOCK_SCENARIOS: Scenario[] = [
  {
    id: "demo-kpop",
    name: "K-pop College AU",
    cover: "https://picsum.photos/600/400?random=1",
    playerIds: ["u5", "u7", "u14", "u6"],
    createdAt: "2024-06-01T00:00:00Z",
    updatedAt: "2024-06-01T00:00:00Z",
    inviteCode: "KPOP2024",

    ownerUserId: "u14",
    description:
      "slice-of-life college AU with chaotic group chats, fake dating tension, and too many greenhouse shifts.",

    tags: [
      { id: "t_college", key: "college", name: "College", color: "#ffc65cff" },
      { id: "t_romcom", key: "romcom", name: "Romcom", color: "#fd92d0ff" },
      { id: "t_groupchat", key: "group chat", name: "Group Chat", color: "#83fad3ff" },
    ],
  },
  {
    id: "demo-royalty",
    name: "Modern Royalty AU",
    cover: "https://picsum.photos/600/400?random=2",
    playerIds: ["u8", "u9", "u14"],
    createdAt: "2024-06-01T00:00:00Z",
    updatedAt: "2024-06-01T00:00:00Z",
    inviteCode: "ROYAL2024",

    ownerUserId: "u14",
    description:
      "modern monarchy politics, PR disasters, reform vs. tradition, and one heir who hates ceremonies.",

    tags: [
      { id: "t_politics", key: "politics", name: "Politics", color: "#9db7ffff" },
      { id: "t_royalty", key: "royalty", name: "Royalty", color: "#d8b4feff" },
      { id: "t_drama", key: "drama", name: "Drama", color: "#ff8aaeff" },
    ],
  },
  {
    id: "demo-mafia",
    name: "Mafia Heist AU",
    cover: "https://loremflickr.com/800/400/castle",
    playerIds: ["u12", "u13", "u10", "u11", "u14"],
    createdAt: "2024-06-01T00:00:00Z",
    updatedAt: "2024-06-01T00:00:00Z",
    inviteCode: "MAFIA2024",

    ownerUserId: "u13",
    description:
      "rival crews, debt, street racing, dirty jobs, and loyalty that looks a lot like possession.",

    tags: [
      { id: "t_mafia", key: "mafia", name: "Mafia", color: "#111827ff" },
      { id: "t_heist", key: "heist", name: "Heist", color: "#f59e0bff" },
      { id: "t_action", key: "action", name: "Action", color: "#22c55eff" },
    ],
  },
];
// mocks/scenarios.ts
import type { Scenario } from "@/data/db/schema";

export const MOCK_SCENARIOS: Scenario[] = [
  {
    id: "demo-kpop",
    name: "K-pop College AU",
    cover: "https://loremflickr.com/800/400/university",
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

    mode: "story",
    dmUserIds: ["u14"],
  },
  {
    id: "demo-royalty",
    name: "Modern Royalty AU",
    cover: "https://loremflickr.com/800/400/royalty",
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

    mode: "story",
    dmUserIds: ["u14"],
  },
  {
    id: "demo-mafia",
    name: "Mafia Heist AU",
    cover: "https://loremflickr.com/800/400/mafia",
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

    mode: "story",
    dmUserIds: ["u13"],
  },
  {
    id: "demo-campaign",
    name: "Echoes of the Fallen Realm",
    cover: "https://loremflickr.com/800/400/fantasy,dragon",
    playerIds: ["u14", "u5", "u7", "u9"],
    createdAt: "2024-06-01T00:00:00Z",
    updatedAt: "2024-06-01T00:00:00Z",
    inviteCode: "ECHOES2024",

    ownerUserId: "u14",
    description:
      "a text-based fantasy campaign where ancient ruins, broken oaths, and forgotten gods resurface. choices matter, rolls are public, and the realm remembers everything.",

    tags: [
      { id: "t_fantasy", key: "fantasy", name: "Fantasy", color: "#7c83fdff" },
      { id: "t_campaign", key: "campaign", name: "Campaign", color: "#34d399ff" },
      { id: "t_rp", key: "rp", name: "RP", color: "#f472b6ff" },
    ],

    mode: "campaign",
    dmUserIds: ["u14"],
  },
  {
  id: "demo-campaign-u13",
  name: "Ashford Hollow: The Red Ledger",
  cover: "https://loremflickr.com/800/400/fantasy,forest,ruins",
  playerIds: ["u13", "u12", "u10", "u11", "u14"],
  createdAt: "2024-06-01T00:00:00Z",
  updatedAt: "2024-06-01T00:00:00Z",
  inviteCode: "ASHFORD24",

  ownerUserId: "u13",
  description:
    "a campaign of cursed contracts, missing pilgrims, and a town that keeps rewriting its own history. oaths bind harder than chains, and the ledger always balances.",

  tags: [
    { id: "t_fantasy", key: "fantasy", name: "Fantasy", color: "#7c83fdff" },
    { id: "t_campaign", key: "campaign", name: "Campaign", color: "#34d399ff" },
    { id: "t_mystery", key: "mystery", name: "Mystery", color: "#60a5faff" },
  ],

  mode: "campaign",
  dmUserIds: ["u13"],
},
];
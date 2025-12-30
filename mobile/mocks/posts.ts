// mobile/mocks/posts.ts
import type { Post } from "@/data/db/schema";

export const MOCK_FEEDS: Record<string, Post[]> = {
  "demo-kpop": [
    {
      id: "s1-post-1",
      scenarioId: "demo-kpop",
      authorProfileId: "pr_kpop_jinnie",
      text: "first day back and i already lost my student card. again.",
      createdAt: "2025-12-20T09:12:00.000Z",
      replyCount: 2,
      repostCount: 1,
      likeCount: 34,
      insertedAt: "2025-12-20T09:12:05.000Z",
    },
    {
      id: "s1-post-2",
      scenarioId: "demo-kpop",
      authorProfileId: "pr_kpop_minho",
      text: "if you see someone running with a lanyard… no you didn’t.",
      createdAt: "2025-12-20T09:18:00.000Z",
      replyCount: 1,
      repostCount: 4,
      likeCount: 210,
      quotedPostId: "s1-post-1",
      insertedAt: "2025-12-20T09:18:10.000Z",
    },
    {
      id: "s1-post-3",
      scenarioId: "demo-kpop",
      authorProfileId: "pr_kpop_winter",
      text: "who schedules an 8am lab and why do they still have a job",
      createdAt: "2025-12-20T06:58:00.000Z",
      replyCount: 0,
      repostCount: 0,
      likeCount: 12,
      insertedAt: "2025-12-20T06:58:15.000Z",
    },
    // replies
    {
      id: "s1-post-1-r1",
      scenarioId: "demo-kpop",
      authorProfileId: "pr_kpop_jisung",
      text: "this has become a personality trait.",
      createdAt: "2025-12-20T09:21:00.000Z",
      parentPostId: "s1-post-1",
      replyCount: 0,
      repostCount: 0,
      likeCount: 40,
      insertedAt: "2025-12-20T09:21:05.000Z",
    },
    {
      id: "s1-post-1-r2",
      scenarioId: "demo-kpop",
      authorProfileId: "pr_kpop_winter",
      text: "you lose everything except confidence",
      createdAt: "2025-12-20T09:22:00.000Z",
      parentPostId: "s1-post-1",
      replyCount: 0,
      repostCount: 0,
      likeCount: 55,
      insertedAt: "2025-12-20T09:22:10.000Z",
    },
    {
      id: "s1-post-2-r1",
      scenarioId: "demo-kpop",
      authorProfileId: "pr_kpop_jinnie",
      text: "give it back. i will pay in emotional support.",
      createdAt: "2025-12-20T09:24:00.000Z",
      parentPostId: "s1-post-2",
      replyCount: 0,
      repostCount: 0,
      likeCount: 78,
      insertedAt: "2025-12-20T09:24:15.000Z",
    },
  ],

  "demo-mafia": [
    {
      id: "s2-post-1",
      scenarioId: "demo-mafia",
      authorProfileId: "pr_mafia_driver",
      text: "first day of training. they said it would be ‘light’. it was a lie.",
      createdAt: "2025-12-21T15:10:00.000Z",
      replyCount: 2,
      repostCount: 2,
      likeCount: 98,
      insertedAt: "2025-12-21T15:10:05.000Z",
    },
    {
      id: "s2-post-2",
      scenarioId: "demo-mafia",
      authorProfileId: "pr_mafia_fixer",
      text: "why is everyone acting like sprinting at full speed is a warm-up",
      createdAt: "2025-12-21T15:14:00.000Z",
      replyCount: 1,
      repostCount: 0,
      likeCount: 62,
      insertedAt: "2025-12-21T15:14:10.000Z",
    },
    {
      id: "s2-post-3",
      scenarioId: "demo-mafia",
      authorProfileId: "pr_mafia_boss",
      text: "it’s not hard. you’re just dramatic.",
      createdAt: "2025-12-21T15:18:00.000Z",
      replyCount: 0,
      repostCount: 3,
      likeCount: 140,
      quotedPostId: "s2-post-1",
      insertedAt: "2025-12-21T15:18:15.000Z",
    },
    {
      id: "s2-post-1-r1",
      scenarioId: "demo-mafia",
      authorProfileId: "pr_mafia_sniper",
      text: "wait for day 3. then complain.",
      createdAt: "2025-12-21T15:20:00.000Z",
      parentPostId: "s2-post-1",
      likeCount: 80,
      insertedAt: "2025-12-21T15:20:05.000Z",
    },
    {
      id: "s2-post-1-r2",
      scenarioId: "demo-mafia",
      authorProfileId: "pr_mafia_fixer",
      text: "day 3?? i was hoping to be dead by day 2",
      createdAt: "2025-12-21T15:22:00.000Z",
      parentPostId: "s2-post-1",
      likeCount: 100,
      insertedAt: "2025-12-21T15:22:10.000Z",
    },
    {
      id: "s2-post-2-r1",
      scenarioId: "demo-mafia",
      authorProfileId: "pr_mafia_driver",
      text: "you’re doing amazing sweetie (you’re not).",
      createdAt: "2025-12-21T15:25:00.000Z",
      parentPostId: "s2-post-2",
      likeCount: 120,
      insertedAt: "2025-12-21T15:25:15.000Z",
    },
    // quotes
    {
      id: "s2-post-4",
      scenarioId: "demo-mafia",
      authorProfileId: "pr_mafia_winter",
      text: "i thought this would be easier than my last job.",
      createdAt: "2025-12-21T16:00:00.000Z",
      quotedPostId: "s2-post-3",
      replyCount: 0,
      repostCount: 1,
      likeCount: 45,
      insertedAt: "2025-12-21T16:00:20.000Z",
    },
    {
      id: "s2-post-5",
      scenarioId: "demo-mafia",
      authorProfileId: "pr_mafia_winter",
      text: "you're dramatic",
      createdAt: "2025-12-21T16:00:00.000Z",
      quotedPostId: "s2-post-3",
      replyCount: 0,
      repostCount: 1,
      likeCount: 45,
      insertedAt: "2025-12-21T16:00:25.000Z",
    },
  ],
  "demo-campaign": [
    // ─────────────────────────────────────────────
    // 📌 PINNED POSTS (GM / system)
    // ─────────────────────────────────────────────
    {
      id: "cmp-pin-rules",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_system",
      text:
        "📌 campaign rules\n\n" +
        "• rolls are public.\n" +
        "• say what you attempt, then roll.\n" +
        "• criticals: d20 = crit success, d1 = crit fail.\n" +
        "• keep OOC in DMs (OOC tab).\n" +
        "• be kind. we can be dramatic in-character, not to each other.",
      createdAt: "2025-12-29T08:00:00.000Z",
      insertedAt: "2025-12-29T08:00:02.000Z",
      postType: "gm",
      isPinned: true,
      pinOrder: 1,
    },
    {
      id: "cmp-pin-intro",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_system",
      text:
        "📌 intro\n\n" +
        "the fallen realm has started whispering again.\n" +
        "caravans vanish near the old road. a bell rings in ruins with no tower.\n" +
        "you arrive in ashford, a town pretending it’s not scared.",
      createdAt: "2025-12-29T08:05:00.000Z",
      insertedAt: "2025-12-29T08:05:03.000Z",
      postType: "gm",
      isPinned: true,
      pinOrder: 2,
    },
    {
      id: "cmp-pin-quests",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_system",
      text:
        "📌 quest board\n\n" +
        "1) missing caravan — last seen near the old bridge.\n" +
        "2) the bell in the ruins — it rings at dusk.\n" +
        "3) ashford chapel — someone keeps leaving coins soaked in saltwater.\n\n" +
        "reply with what you take + any preparation.",
      createdAt: "2025-12-29T08:10:00.000Z",
      insertedAt: "2025-12-29T08:10:03.000Z",
      postType: "quest",
      isPinned: true,
      pinOrder: 3,
      meta: {
        quests: [
          { id: "q1", title: "missing caravan", status: "open" },
          { id: "q2", title: "the bell in the ruins", status: "open" },
          { id: "q3", title: "ashford chapel", status: "open" },
        ],
      },
    },

    // ─────────────────────────────────────────────
    // 📰 LOG POST (session start)
    // ─────────────────────────────────────────────
    {
      id: "cmp-log-1",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_dm_winter",
      text:
        "session log — day 1\n" +
        "• party meets in ashford.\n" +
        "• town rumors: missing caravan + bell in ruins.\n" +
        "• you decide to investigate the old bridge first.",
      createdAt: "2025-12-29T09:00:00.000Z",
      insertedAt: "2025-12-29T09:00:05.000Z",
      postType: "log",
    },

    // ─────────────────────────────────────────────
    // ✍️ RP POSTS
    // ─────────────────────────────────────────────
    {
      id: "cmp-rp-1",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_elyra",
      text:
        "elyra slides into the inn like she belongs there, hood half-up, eyes already counting exits.\n" +
        "\"who’s paying?\" she asks, like it’s a joke. it isn’t.",
      createdAt: "2025-12-29T09:05:00.000Z",
      insertedAt: "2025-12-29T09:05:04.000Z",
      replyCount: 2,
      repostCount: 0,
      likeCount: 7,
      postType: "rp",
    },
    {
      id: "cmp-rp-1-r1",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_brom",
      text:
        "brom drops onto the nearest chair with the confidence of a man who has never been politely asked to leave.\n" +
        "\"i’ll pay. but if anyone lies to me, i’m breaking the chair first.\"",
      createdAt: "2025-12-29T09:06:30.000Z",
      insertedAt: "2025-12-29T09:06:33.000Z",
      parentPostId: "cmp-rp-1",
      postType: "rp",
      likeCount: 5,
    },
    {
      id: "cmp-rp-1-r2",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_mira",
      text:
        "mira sets her holy symbol on the table like it’s an invitation and a warning.\n" +
        "\"we can afford honesty. we can’t afford panic.\"",
      createdAt: "2025-12-29T09:07:10.000Z",
      insertedAt: "2025-12-29T09:07:13.000Z",
      parentPostId: "cmp-rp-1",
      postType: "rp",
      likeCount: 6,
    },

    // ─────────────────────────────────────────────
    // 🎲 ROLL POSTS (public)
    // ─────────────────────────────────────────────
    {
      id: "cmp-roll-1",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_elyra",
      text: "i want to listen for anything… wrong. whispers, patterns, whatever the room is hiding.",
      createdAt: "2025-12-29T09:10:00.000Z",
      insertedAt: "2025-12-29T09:10:02.000Z",
      postType: "roll",
      meta: {
        type: "roll",
        profileId: "pr_cmp_elyra",
        stat: "wisdom",
        dice: "d20",
        baseRoll: 17,
        modifier: 2,
        total: 19,
        result: "success",
        text: "perception — scanning the inn for signals",
      },
    },
    {
      id: "cmp-roll-2",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_brom",
      text: "i’m checking the innkeeper’s story for holes. i’ve met ‘honest’ men before.",
      createdAt: "2025-12-29T09:11:00.000Z",
      insertedAt: "2025-12-29T09:11:03.000Z",
      postType: "roll",
      meta: {
        type: "roll",
        profileId: "pr_cmp_brom",
        stat: "wisdom",
        dice: "d20",
        baseRoll: 4,
        modifier: 1,
        total: 5,
        result: "fail",
        text: "insight — reading the innkeeper",
      },
    },

    // ─────────────────────────────────────────────
    // 🗺️ QUEST POSTS (updates)
    // ─────────────────────────────────────────────
    {
      id: "cmp-quest-1",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_system",
      text: "quest update: missing caravan — you head for the old bridge at first light.",
      createdAt: "2025-12-29T09:20:00.000Z",
      insertedAt: "2025-12-29T09:20:04.000Z",
      postType: "quest",
      meta: {
        questId: "q1",
        status: "active",
        objective: "reach the old bridge + search for tracks",
      },
    },

    // ─────────────────────────────────────────────
    // ⚔️ COMBAT POSTS (small encounter)
    // ─────────────────────────────────────────────
    {
      id: "cmp-combat-1",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_dm_winter",
      text:
        "combat — roadside ambush\n" +
        "a shape detaches from the trees. then another.\n" +
        "roll initiative.",
      createdAt: "2025-12-29T10:00:00.000Z",
      insertedAt: "2025-12-29T10:00:03.000Z",
      postType: "combat",
      meta: {
        encounterId: "e1",
        phase: "initiative",
        enemies: [{ id: "en_1", name: "grave-gnawed bandit" }, { id: "en_2", name: "grave-gnawed bandit" }],
      },
    },
    {
      id: "cmp-roll-init-elyra",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_elyra",
      text: "initiative.",
      createdAt: "2025-12-29T10:01:00.000Z",
      insertedAt: "2025-12-29T10:01:02.000Z",
      postType: "roll",
      meta: {
        type: "roll",
        profileId: "pr_cmp_elyra",
        stat: "dexterity",
        dice: "d20",
        baseRoll: 13,
        modifier: 3,
        total: 16,
        result: "success",
        text: "initiative",
      },
    },
    {
      id: "cmp-roll-init-brom",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_brom",
      text: "initiative.",
      createdAt: "2025-12-29T10:01:20.000Z",
      insertedAt: "2025-12-29T10:01:22.000Z",
      postType: "roll",
      meta: {
        type: "roll",
        profileId: "pr_cmp_brom",
        stat: "dexterity",
        dice: "d20",
        baseRoll: 6,
        modifier: 0,
        total: 6,
        result: "fail",
        text: "initiative",
      },
    },
    {
      id: "cmp-roll-init-mira",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_mira",
      text: "initiative.",
      createdAt: "2025-12-29T10:01:40.000Z",
      insertedAt: "2025-12-29T10:01:42.000Z",
      postType: "roll",
      meta: {
        type: "roll",
        profileId: "pr_cmp_mira",
        stat: "dexterity",
        dice: "d20",
        baseRoll: 12,
        modifier: 1,
        total: 13,
        result: "success",
        text: "initiative",
      },
    },
    {
      id: "cmp-combat-2",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_dm_winter",
      text:
        "turn order: elyra (16) → mira (13) → bandits → brom (6)\n" +
        "elyra, you’re up.",
      createdAt: "2025-12-29T10:02:20.000Z",
      insertedAt: "2025-12-29T10:02:23.000Z",
      postType: "combat",
      meta: { encounterId: "e1", phase: "turn", current: "pr_cmp_elyra" },
    },
    {
      id: "cmp-rp-combat-elyra-1",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_elyra",
      text:
        "elyra moves before her fear can catch up.\n" +
        "she drops low, blade out, aiming for the closest one’s ribs.",
      createdAt: "2025-12-29T10:03:00.000Z",
      insertedAt: "2025-12-29T10:03:02.000Z",
      postType: "rp",
    },
    {
      id: "cmp-roll-attack-elyra",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_elyra",
      text: "attack roll (shortsword).",
      createdAt: "2025-12-29T10:03:10.000Z",
      insertedAt: "2025-12-29T10:03:12.000Z",
      postType: "roll",
      meta: {
        type: "roll",
        profileId: "pr_cmp_elyra",
        stat: "dexterity",
        dice: "d20",
        baseRoll: 18,
        modifier: 5,
        total: 23,
        result: "success",
        text: "attack — shortsword",
      },
    },
    {
      id: "cmp-combat-elyra-dmg",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_dm_winter",
      text: "hit. describe damage / roll it if you want, otherwise i’ll apply a flat value for demo.",
      createdAt: "2025-12-29T10:03:25.000Z",
      insertedAt: "2025-12-29T10:03:27.000Z",
      postType: "combat",
      meta: { encounterId: "e1", phase: "damage_prompt", target: "en_1" },
    },

    // ─────────────────────────────────────────────
    // 📜 LOG POST (post-fight wrap)
    // ─────────────────────────────────────────────
    {
      id: "cmp-log-2",
      scenarioId: "demo-campaign",
      authorProfileId: "pr_cmp_dm_winter",
      text:
        "session log — after the ambush\n" +
        "• the bandits carried ashford tokens (fake).\n" +
        "• one kept whispering about 'the bell'.\n" +
        "• you continue toward the bridge with a bad feeling.",
      createdAt: "2025-12-29T10:30:00.000Z",
      insertedAt: "2025-12-29T10:30:03.000Z",
      postType: "log",
    },
  ],
  "demo-campaign-u13": [
    // ─────────────────────────────────────────────
    // 📌 PINNED (SYSTEM)
    // ─────────────────────────────────────────────
    {
      id: "u13-pin-rules",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_system",
      text:
        "📌 CAMPAIGN RULES\n\n" +
        "• Rolls are public.\n" +
        "• Say what you attempt, then roll.\n" +
        "• Crits: d20 = crit success, d1 = crit fail.\n" +
        "• Keep OOC in DMs.\n" +
        "• Be kind. Be dramatic in-character, not to each other.",
      createdAt: "2025-12-29T08:00:00.000Z",
      insertedAt: "2025-12-29T08:00:02.000Z",
      postType: "gm",
      isPinned: true,
      pinOrder: 1,
    },
    {
      id: "u13-pin-intro",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_system",
      text:
        "📌 INTRO\n\n" +
        "ashford hollow smells like wet paper and old coins.\n" +
        "a red ledger has started updating itself again.\n" +
        "names appear. dates appear. some are in the future.",
      createdAt: "2025-12-29T08:05:00.000Z",
      insertedAt: "2025-12-29T08:05:03.000Z",
      postType: "gm",
      isPinned: true,
      pinOrder: 2,
    },
    {
      id: "u13-pin-quests",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_system",
      text:
        "📌 QUEST BOARD\n\n" +
        "1) The Red Ledger — who is writing in it?\n" +
        "2) Missing Pilgrims — last seen near the salt chapel.\n" +
        "3) The Old Archive — locked room under the town hall.\n\n" +
        "reply with what you take + any preparation.",
      createdAt: "2025-12-29T08:10:00.000Z",
      insertedAt: "2025-12-29T08:10:03.000Z",
      postType: "quest",
      isPinned: true,
      pinOrder: 3,
      meta: {
        quests: [
          { id: "q1", title: "the red ledger", status: "open" },
          { id: "q2", title: "missing pilgrims", status: "open" },
          { id: "q3", title: "the old archive", status: "open" },
        ],
      },
    },

    // ─────────────────────────────────────────────
    // 📰 LOG (DM)
    // ─────────────────────────────────────────────
    {
      id: "u13-log-1",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_dm",
      text:
        "session log — day 1\n" +
        "• you meet at the hollow inn.\n" +
        "• rumor: the ledger ‘predicts’ debts.\n" +
        "• you decide to check the town hall archive first.",
      createdAt: "2025-12-29T09:00:00.000Z",
      insertedAt: "2025-12-29T09:00:05.000Z",
      postType: "log",
    },

    // ─────────────────────────────────────────────
    // ✍️ RP
    // ─────────────────────────────────────────────
    {
      id: "u13-rp-1",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_riven",
      text:
        "riven doesn’t sit with his back to the room. he never does.\n" +
        "\"tell me where the ledger is kept,\" he says, like it’s a request and a threat.",
      createdAt: "2025-12-29T09:05:00.000Z",
      insertedAt: "2025-12-29T09:05:04.000Z",
      replyCount: 3,
      likeCount: 5,
      repostCount: 0,
      postType: "rp",
    },
    {
      id: "u13-rp-1-r1",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_sera",
      text:
        "sera smiles like she’s reading a contract nobody else can see.\n" +
        "\"if it’s predicting debts, i’d like to know who’s collecting.\"",
      createdAt: "2025-12-29T09:06:30.000Z",
      insertedAt: "2025-12-29T09:06:33.000Z",
      parentPostId: "u13-rp-1",
      postType: "rp",
      likeCount: 6,
    },
    {
      id: "u13-rp-1-r2",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_ioren",
      text:
        "\"predictions are just data with better PR,\" ioren says.\n" +
        "he taps the table once. \"let’s see the source.\"",
      createdAt: "2025-12-29T09:07:10.000Z",
      insertedAt: "2025-12-29T09:07:13.000Z",
      parentPostId: "u13-rp-1",
      postType: "rp",
      likeCount: 4,
    },
    {
      id: "u13-rp-1-r3",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_winter",
      text:
        "winter glances at the quest board like it might glance back.\n" +
        "\"i don’t like when paper acts alive,\" she admits, quiet and honest.",
      createdAt: "2025-12-29T09:08:10.000Z",
      insertedAt: "2025-12-29T09:08:13.000Z",
      parentPostId: "u13-rp-1",
      postType: "rp",
      likeCount: 7,
    },

    // ─────────────────────────────────────────────
    // 🎲 ROLLS
    // ─────────────────────────────────────────────
    {
      id: "u13-roll-1",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_ioren",
      text: "i want to recall anything about cursed ledgers / self-updating tomes.",
      createdAt: "2025-12-29T09:12:00.000Z",
      insertedAt: "2025-12-29T09:12:02.000Z",
      postType: "roll",
      meta: {
        type: "roll",
        profileId: "pr_cmp_u13_ioren",
        stat: "intelligence",
        dice: "d20",
        baseRoll: 15,
        modifier: 3,
        total: 18,
        result: "success",
        text: "arcana — cursed documentation",
      },
    },
    {
      id: "u13-quest-1",
      scenarioId: "demo-campaign-u13",
      authorProfileId: "pr_cmp_u13_system",
      text: "quest update: the old archive — you get escorted to the town hall basement.",
      createdAt: "2025-12-29T09:20:00.000Z",
      insertedAt: "2025-12-29T09:20:04.000Z",
      postType: "quest",
      meta: {
        questId: "q3",
        status: "active",
        objective: "reach the archive door + find the key",
      },
    },
  ],
  
};

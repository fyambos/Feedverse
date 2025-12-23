export type FeedPost = {
  id: string;
  scenarioId: string;
  authorProfileId: string;
  createdAt: string;
  text: string;
  imageUrl?: string;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  parentPostId?: string | null;
  quotedPostId?: string | null;
};

export const MOCK_FEEDS: Record<string, FeedPost[]> = {
  'demo-kpop': [
    {
      id: 'k1',
      scenarioId: 'demo-kpop',
      authorProfileId: 'pr_kpop_minho',
      createdAt: '2025-11-27T14:02:00.000Z',
      text: "i’m going to kill them",
      replyCount: 1,
      repostCount: 2,
      likeCount: 4,
    },
    {
      id: 'k2',
      scenarioId: 'demo-kpop',
      authorProfileId: 'pr_kpop_jinnie',
      createdAt: '2025-11-27T14:06:00.000Z',
      text: "i forgot to do groceries so we made buldak ramyun instead… but it’s so good!!",
      imageUrl:
        'https://images.unsplash.com/photo-1491961865842-98f7befd1a60?auto=format&fit=crop&w=1200&q=80',
      replyCount: 2,
      repostCount: 0,
      likeCount: 0,
    },
    {
      id: 'k3',
      scenarioId: 'demo-kpop',
      authorProfileId: 'pr_kpop_jisung',
      createdAt: '2025-11-27T10:10:00.000Z',
      text: "that was the quickest setup",
      imageUrl:
        'https://plus.unsplash.com/premium_photo-1673580742890-4af144293960?auto=format&fit=crop&w=1200&q=80',
      replyCount: 1,
      repostCount: 0,
      likeCount: 0,
    },
    {
    id: 'k1_r1',
    scenarioId: 'demo-kpop',
    authorProfileId: 'pr_kpop_jinnie',
    createdAt: '2025-11-27T14:12:00.000Z',
    text: "who is 'them' and do i need to bring a shovel",
    parentPostId: 'k1',
    replyCount: 0,
    repostCount: 0,
    likeCount: 0    ,
    },
    {
    id: 'k1_r2',
    scenarioId: 'demo-kpop',
    authorProfileId: 'pr_kpop_jisung',
    createdAt: '2025-11-27T14:15:00.000Z',
    text: "not me reading this like it's about me",
    parentPostId: 'k1',
    replyCount: 1,
    repostCount: 0,
    likeCount: 1,
    },
    {
    id: 'k1_r2_a1',
    scenarioId: 'demo-kpop',
    authorProfileId: 'pr_kpop_minho',
    createdAt: '2025-11-27T14:40:00.000Z',
    text: "it IS about you.",
    parentPostId: 'k1_r2',
    replyCount: 0,
    repostCount: 0,
    likeCount: 2,
    },

  ],

  'demo-royalty': [
    {
      id: 'r1',
      scenarioId: 'demo-royalty',
      authorProfileId: 'pr_roy_prince',
      createdAt: '2025-12-16T10:30:00.000Z',
      text: "they moved the coronation up four years. cool. love that for me.",
      replyCount: 3,
      repostCount: 1,
      likeCount: 7,
    },
    {
      id: 'r2',
      scenarioId: 'demo-royalty',
      authorProfileId: 'pr_roy_butler',
      createdAt: '2025-12-16T11:04:00.000Z',
      text: "protocol reminder: do not weaponize charity events to dodge council meetings.",
      replyCount: 2,
      repostCount: 0,
      likeCount: 4,
    },
    {
      id: 'r3',
      scenarioId: 'demo-royalty',
      authorProfileId: 'pr_roy_linda',
      createdAt: '2025-12-16T11:09:00.000Z',
      text: "the new trainers arrived. yes, he will complain. no, he will not quit.",
      replyCount: 1,
      repostCount: 0,
      likeCount: 6,
    },
  ],

  'demo-mafia': [
    {
      id: 'm1',
      scenarioId: 'demo-mafia',
      authorProfileId: 'pr_mafia_driver',
      createdAt: '2025-12-01T23:11:00.000Z',
      text: "if anyone touches my car, i’m filing a missing persons report preemptively",
      replyCount: 4,
      repostCount: 1,
      likeCount: 9,
    },
    {
      id: 'm2',
      scenarioId: 'demo-mafia',
      authorProfileId: 'pr_mafia_fixer',
      createdAt: '2025-12-01T23:20:00.000Z',
      text: "restocked. don’t ask what it is. you don’t want to know.",
      replyCount: 0,
      repostCount: 0,
      likeCount: 3,
    },
    {
      id: 'm3',
      scenarioId: 'demo-mafia',
      authorProfileId: 'pr_mafia_boss',
      createdAt: '2025-12-01T23:31:00.000Z',
      text: "i don’t lose. i just let people live.",
      replyCount: 2,
      repostCount: 0,
      likeCount: 5,
    },
  ],
};

export type Profile = {
  id: string;
  scenarioId: string;
  ownerUserId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  bio?: string;
  isPublic?: boolean;
};

export const MOCK_PROFILES: Profile[] = [
  {
    id: 'pr_kpop_jinnie',
    scenarioId: 'demo-kpop',
    ownerUserId: 'u5',
    displayName: 'jinnie',
    handle: 'jiniret',
    avatarUrl: 'https://i.pravatar.cc/200?img=47',
    bio: 'dance major menace',
    isPublic: true,
  },
  {
    id: 'pr_kpop_minho',
    scenarioId: 'demo-kpop',
    ownerUserId: 'u7',
    displayName: 'minho',
    handle: 'leenosaurus',
    avatarUrl: 'https://i.pravatar.cc/200?img=14',
    bio: 'i know where the snacks are',
    isPublic: false,
  },
  {
    id: 'pr_kpop_jisung',
    scenarioId: 'demo-kpop',
    ownerUserId: 'u6',
    displayName: 'jisung',
    handle: 'therealhan',
    avatarUrl: 'https://i.pravatar.cc/200?img=22',
    bio: 'unhinged but helpful',
    isPublic: false,
  },

  {
    id: 'pr_roy_prince',
    scenarioId: 'demo-royalty',
    ownerUserId: 'u8',
    displayName: 'prince hj',
    handle: 'crownrebellion',
    avatarUrl: 'https://i.pravatar.cc/200?img=9',
    isPublic: false,
  },
  {
    id: 'pr_roy_butler',
    scenarioId: 'demo-royalty',
    ownerUserId: 'u9',
    displayName: 'seungmin',
    handle: 'protocolmin',
    avatarUrl: 'https://i.pravatar.cc/200?img=21',
    isPublic: false,
  },
  {
    id: 'pr_roy_linda',
    scenarioId: 'demo-royalty',
    ownerUserId: 'u9',
    displayName: 'linda',
    handle: 'chamberaid',
    avatarUrl: 'https://i.pravatar.cc/200?img=28',
    isPublic: false,
  },

  {
    id: 'pr_mafia_driver',
    scenarioId: 'demo-mafia',
    ownerUserId: 'u12',
    displayName: 'hwangjin',
    handle: 'jiniret',
    avatarUrl: 'https://i.pravatar.cc/200?img=19',
    isPublic: false,
  },
  {
    id: 'pr_mafia_boss',
    scenarioId: 'demo-mafia',
    ownerUserId: 'u10',
    displayName: 'changbin',
    handle: 'bullalpha',
    avatarUrl: 'https://i.pravatar.cc/200?img=37',
    isPublic: false,
  },
  {
    id: 'pr_mafia_sniper',
    scenarioId: 'demo-mafia',
    ownerUserId: 'u11',
    displayName: 'chan',
    handle: 'scopezero',
    avatarUrl: 'https://i.pravatar.cc/200?img=41',
    isPublic: false,
  },
  {
    id: 'pr_mafia_fixer',
    scenarioId: 'demo-mafia',
    ownerUserId: 'u13',
    displayName: 'minho',
    handle: 'pharmacist',
    avatarUrl: 'https://i.pravatar.cc/200?img=45',
    isPublic: false,
  },
  {
  id: 'pr_kpop_winter',
  scenarioId: 'demo-kpop', 
  ownerUserId: 'u14',
  displayName: 'winter',
  handle: 'bbunnll',
  avatarUrl: 'https://i.pravatar.cc/150?img=15',
    isPublic: false,
},
  {
  id: 'pr_kpop_admin',
  scenarioId: 'demo-kpop', 
  ownerUserId: 'u14',
  displayName: 'admin',
  handle: 'admin',
  avatarUrl: 'https://i.pravatar.cc/150?img=16',
  isPublic: false,
},
{
  id: 'pr_royalty_winter',
  scenarioId: 'demo-royalty',
  ownerUserId: 'u14',
  displayName: 'winter',
  handle: 'bbunnll',
  avatarUrl: 'https://i.pravatar.cc/150?img=17',
  isPublic: false,
},
{
  id: 'pr_mafia_winter',
  scenarioId: 'demo-mafia',
  ownerUserId: 'u14',
  displayName: 'winter',
  handle: 'bbunnll',
  avatarUrl: 'https://i.pravatar.cc/150?img=18',
  isPublic: false,
},
];

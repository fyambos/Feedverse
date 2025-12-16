export type Profile = {
  id: string;
  scenarioId: string;
  ownerUserId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  bio?: string;
};

export const MOCK_PROFILES: Profile[] = [
  {
    id: 'pr_kpop_jinnie',
    scenarioId: 'demo-kpop',
    ownerUserId: 'u5',
    displayName: 'jinnie',
    handle: '@jiniret',
    avatarUrl: 'https://i.pravatar.cc/200?img=47',
    bio: 'dance major menace',
  },
  {
    id: 'pr_kpop_minho',
    scenarioId: 'demo-kpop',
    ownerUserId: 'u7',
    displayName: 'minho',
    handle: '@leenosaurus',
    avatarUrl: 'https://i.pravatar.cc/200?img=14',
    bio: 'i know where the snacks are',
  },
  {
    id: 'pr_kpop_jisung',
    scenarioId: 'demo-kpop',
    ownerUserId: 'u6',
    displayName: 'jisung',
    handle: '@therealhan',
    avatarUrl: 'https://i.pravatar.cc/200?img=22',
    bio: 'unhinged but helpful',
  },

  {
    id: 'pr_roy_prince',
    scenarioId: 'demo-royalty',
    ownerUserId: 'u8',
    displayName: 'prince hj',
    handle: '@crownrebellion',
    avatarUrl: 'https://i.pravatar.cc/200?img=9',
  },
  {
    id: 'pr_roy_butler',
    scenarioId: 'demo-royalty',
    ownerUserId: 'u9',
    displayName: 'seungmin',
    handle: '@protocolmin',
    avatarUrl: 'https://i.pravatar.cc/200?img=21',
  },
  {
    id: 'pr_roy_linda',
    scenarioId: 'demo-royalty',
    ownerUserId: 'u9',
    displayName: 'linda',
    handle: '@chamberaid',
    avatarUrl: 'https://i.pravatar.cc/200?img=28',
  },

  {
    id: 'pr_mafia_driver',
    scenarioId: 'demo-mafia',
    ownerUserId: 'u12',
    displayName: 'hwangjin',
    handle: '@jiniret',
    avatarUrl: 'https://i.pravatar.cc/200?img=16',
  },
  {
    id: 'pr_mafia_boss',
    scenarioId: 'demo-mafia',
    ownerUserId: 'u10',
    displayName: 'changbin',
    handle: '@bullalpha',
    avatarUrl: 'https://i.pravatar.cc/200?img=37',
  },
  {
    id: 'pr_mafia_sniper',
    scenarioId: 'demo-mafia',
    ownerUserId: 'u11',
    displayName: 'chan',
    handle: '@scopezero',
    avatarUrl: 'https://i.pravatar.cc/200?img=41',
  },
  {
    id: 'pr_mafia_fixer',
    scenarioId: 'demo-mafia',
    ownerUserId: 'u13',
    displayName: 'minho',
    handle: '@pharmacist',
    avatarUrl: 'https://i.pravatar.cc/200?img=45',
  },
];

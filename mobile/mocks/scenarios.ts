export type MockPlayer = {
  id: string;
  name: string;
  avatar: string;
};

export type MockScenario = {
  id: string;
  name: string;
  cover: string;
  players: MockPlayer[];
};

export const MOCK_SCENARIOS: MockScenario[] = [
  {
    id: 'demo-kpop',
    name: 'K-pop College AU',
    cover: 'https://picsum.photos/600/400?random=1',
    players: [
      {
        id: 'p1',
        name: 'Hyunjin',
        avatar: 'https://i.pravatar.cc/100?img=1',
      },
      {
        id: 'p2',
        name: 'Felix',
        avatar: 'https://i.pravatar.cc/100?img=2',
      },
      {
        id: 'p3',
        name: 'Minho',
        avatar: 'https://i.pravatar.cc/100?img=3',
      },
    ],
  },
  {
    id: 'demo-royalty',
    name: 'Modern Royalty AU',
    cover: 'https://picsum.photos/600/400?random=2',
    players: [
      {
        id: 'p4',
        name: 'Prince',
        avatar: 'https://i.pravatar.cc/100?img=4',
      },
      {
        id: 'p5',
        name: 'Butler',
        avatar: 'https://i.pravatar.cc/100?img=5',
      },
    ],
  },
  {
    id: 'demo-mafia',
    name: 'Mafia Cityverse',
    cover: 'https://loremflickr.com/800/400/castle',
    players: [
      {
        id: 'p6',
        name: 'Boss',
        avatar: 'https://i.pravatar.cc/100?img=5',
      },
      {
        id: 'p7',
        name: 'Sniper',
        avatar: 'https://i.pravatar.cc/100?img=7',
      },
      {
        id: 'p8',
        name: 'Driver',
        avatar: 'https://i.pravatar.cc/100?img=8',
      },
      {
        id: 'p9',
        name: 'Fixer',
        avatar: 'https://i.pravatar.cc/100?img=9',
      },
    ],
  },
];

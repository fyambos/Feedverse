export type MockScenario = {
  id: string;
  name: string;
  cover: string;
  playerIds: string[];
};

export const MOCK_SCENARIOS: MockScenario[] = [
  {
    id: 'demo-kpop',
    name: 'K-pop College AU',
    cover: 'https://picsum.photos/600/400?random=1',
    playerIds: ['u5', 'u6', 'u7', 'u14'],
  },
  {
    id: 'demo-royalty',
    name: 'Modern Royalty AU',
    cover: 'https://picsum.photos/600/400?random=2',
    playerIds: ['u8', 'u9', 'u14'],
  },
  {
    id: 'demo-mafia',
    name: 'Mafia Heist AU',
    cover: 'https://loremflickr.com/800/400/castle',
    playerIds: ['u10', 'u11', 'u12', 'u13', 'u14'],
  },
];

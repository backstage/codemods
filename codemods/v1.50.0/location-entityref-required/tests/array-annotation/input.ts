import type { Location } from '@backstage/catalog-client';

const locs: Location[] = [
  {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/a.yaml',
  },
  {
    id: 'def456',
    type: 'url',
    target: 'https://example.com/b.yaml',
  },
];

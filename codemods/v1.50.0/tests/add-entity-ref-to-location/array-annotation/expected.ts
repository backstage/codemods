import type { Location } from '@backstage/catalog-client';

const locs: Location[] = [
  {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/a.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  },
  {
    id: 'def456',
    type: 'url',
    target: 'https://example.com/b.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  },
];

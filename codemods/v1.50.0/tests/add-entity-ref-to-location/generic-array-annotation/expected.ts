import type { Location } from '@backstage/catalog-client';

const locs: Array<Location> = [
  {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/a.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  },
];

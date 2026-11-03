import type { GetLocationsResponse } from '@backstage/catalog-client';

const response: GetLocationsResponse = [
  {
    data: {
      id: 'abc123',
      type: 'url',
      target: 'https://example.com/a.yaml',
      entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
    },
  },
  {
    data: {
      id: 'def456',
      type: 'url',
      target: 'https://example.com/b.yaml',
      entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
    },
  },
];

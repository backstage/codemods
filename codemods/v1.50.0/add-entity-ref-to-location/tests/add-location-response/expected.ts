import type { AddLocationResponse } from '@backstage/catalog-client';

const response: AddLocationResponse = {
  location: {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/catalog-info.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  },
  entities: [],
};

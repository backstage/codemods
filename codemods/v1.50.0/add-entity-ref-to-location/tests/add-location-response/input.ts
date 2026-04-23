import type { AddLocationResponse } from '@backstage/catalog-client';

const response: AddLocationResponse = {
  location: {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/catalog-info.yaml',
  },
  entities: [],
};

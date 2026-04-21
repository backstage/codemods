import type { GetLocationsResponse } from '@backstage/catalog-client';

const response: GetLocationsResponse = [
  {
    data: {
      id: 'abc123',
      type: 'url',
      target: 'https://example.com/a.yaml',
    },
  },
  {
    data: {
      id: 'def456',
      type: 'url',
      target: 'https://example.com/b.yaml',
    },
  },
];

import type { Location } from '@backstage/catalog-client';

interface GetLocationsResponse {
  locations: Array<{ data: Location }>;
}

const response: GetLocationsResponse = {
  locations: [
    {
      data: {
        id: 'loc-1',
        type: 'url',
        target: 'https://example.com/one.yaml',
      } as Location,
    },
    {
      data: {
        id: 'loc-2',
        type: 'url',
        target: 'https://example.com/two.yaml',
      } as Location,
    },
  ],
};

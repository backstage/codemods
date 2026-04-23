import type { Location } from '@backstage/catalog-client';

function createLocation(): Location {
  return {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/catalog-info.yaml',
  };
}

const makeLocation = (): Location => ({
  id: 'def456',
  type: 'url',
  target: 'https://example.com/other.yaml',
});

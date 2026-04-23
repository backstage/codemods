import type { Location } from '@backstage/catalog-client';

function createLocation(): Location {
  return {
    id: 'abc123',
    type: 'url',
    target: 'https://example.com/catalog-info.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  };
}

const makeLocation = (): Location => ({
  id: 'def456',
  type: 'url',
  target: 'https://example.com/other.yaml',
  entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
});

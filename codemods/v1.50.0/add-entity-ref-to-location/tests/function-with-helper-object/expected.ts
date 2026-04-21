import type { Location } from '@backstage/catalog-client';

function getLocation(): Location {
  const helper = { key: 'value' };
  return {
    id: 'abc123',
    type: 'url',
    target: helper.key,
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  };
}

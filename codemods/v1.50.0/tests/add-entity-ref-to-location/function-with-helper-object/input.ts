import type { Location } from '@backstage/catalog-client';

function getLocation(): Location {
  const helper = { key: 'value' };
  return {
    id: 'abc123',
    type: 'url',
    target: helper.key,
  };
}

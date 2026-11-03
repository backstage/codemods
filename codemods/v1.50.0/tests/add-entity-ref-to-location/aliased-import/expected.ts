import type { Location as CatalogLocation } from '@backstage/catalog-client';

const loc: CatalogLocation = {
  id: 'abc123',
  type: 'url',
  target: 'https://example.com/catalog-info.yaml',
  entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
};

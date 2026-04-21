import type { Location } from '@backstage/catalog-client';

const loc: Location = { id: 'abc', type: 'url', target: 'https://example.com/x.yaml',
  entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef };

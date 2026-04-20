import type { Location } from '@backstage/catalog-client';

const locations: Location[] = [
  { id: 'loc1', type: 'url', target: 'https://example.com/a', entityRef: 'location:default/example', /* TODO(backstage-codemod): replace with actual entityRef */ },
  { id: 'loc2', type: 'url', target: 'https://example.com/b', entityRef: 'location:default/example', /* TODO(backstage-codemod): replace with actual entityRef */ },
  { id: 'loc3', type: 'url', target: 'https://example.com/c', entityRef: 'location:default/example', /* TODO(backstage-codemod): replace with actual entityRef */ },
];

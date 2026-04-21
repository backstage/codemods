import type { Location } from '@backstage/catalog-client';

const locations: Location[] = [
  {
    id: 'loc-1',
    type: 'url',
    target: 'https://example.com/one.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  } as Location,
  {
    id: 'loc-2',
    type: 'url',
    target: 'https://example.com/two.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  } as Location,
];

function getLocation(): Location {
  return {
    id: 'loc-3',
    type: 'url',
    target: 'https://example.com/three.yaml',
    entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
  } as Location;
}

import type { Location } from '@backstage/catalog-client';

const locations: Location[] = [
  {
    id: 'loc-1',
    type: 'url',
    target: 'https://example.com/one.yaml',
  } as Location,
  {
    id: 'loc-2',
    type: 'url',
    target: 'https://example.com/two.yaml',
  } as Location,
];

function getLocation(): Location {
  return {
    id: 'loc-3',
    type: 'url',
    target: 'https://example.com/three.yaml',
  } as Location;
}

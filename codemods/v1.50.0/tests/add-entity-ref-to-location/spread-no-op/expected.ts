import type { Location } from '@backstage/catalog-client';

declare const existingLocation: Location;

const loc: Location = {
  ...existingLocation,
  target: 'https://example.com/new-target.yaml',
};

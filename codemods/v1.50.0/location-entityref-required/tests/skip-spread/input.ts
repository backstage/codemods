import type { Location } from '@backstage/catalog-client';

const existing: Location = {
  id: 'abc123',
  type: 'url',
  target: 'https://example.com/a.yaml',
  entityRef: 'location:default/existing',
};

const copy: Location = { ...existing };

import { Location } from '@backstage/catalog-client';

const loc = {
  id: 'abc123',
  type: 'url',
  target: 'https://example.com/catalog-info.yaml',
} satisfies Location;

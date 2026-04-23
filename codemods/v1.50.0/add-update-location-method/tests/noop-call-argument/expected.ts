import { CatalogApi } from '@backstage/catalog-client';

// The object passed to createCatalogClient is a config object, not a CatalogApi impl.
// Section 3a should NOT inject updateLocation into { filter: [...] }.
const catalogClient: CatalogApi = createCatalogClient({
  filter: ['kind=component'],
  baseUrl: 'http://localhost:7007',
});

import { CatalogApi } from '@backstage/catalog-client';

const mockCatalog = {
  getEntities: jest.fn(),
} as unknown as jest.Mocked<CatalogApi>;

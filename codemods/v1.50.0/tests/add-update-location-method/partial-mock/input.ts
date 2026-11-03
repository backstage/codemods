import { CatalogApi } from '@backstage/catalog-client';

const mockCatalog: Partial<jest.Mocked<CatalogApi>> = {
  getEntities: jest.fn(),
};

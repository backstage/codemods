import { CatalogApi } from '@backstage/catalog-client';

const mockCatalog: jest.Mocked<CatalogApi> = {
  getEntities: jest.fn(),
  getEntityByRef: jest.fn(),
};

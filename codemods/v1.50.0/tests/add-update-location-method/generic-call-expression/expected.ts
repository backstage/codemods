import { CatalogApi } from '@backstage/catalog-client';

declare function createMock<T>(impl: T): jest.Mocked<T>;

const mock = createMock<CatalogApi>({
  getEntities: jest.fn(),
  getEntityByRef: jest.fn(),
  updateLocation: jest.fn(),
});

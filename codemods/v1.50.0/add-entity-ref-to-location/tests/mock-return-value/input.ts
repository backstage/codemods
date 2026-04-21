import type { CatalogApi, Location } from '@backstage/catalog-client';

const mockCatalog: jest.Mocked<CatalogApi> = {
  addLocation: jest.fn().mockResolvedValue({
    location: {
      id: 'mock-id',
      type: 'url',
      target: 'https://example.com/mock.yaml',
    } as Location,
    entities: [],
  }),
} as unknown as jest.Mocked<CatalogApi>;

import { CatalogApi } from '@backstage/catalog-client';
import { vi } from 'vitest';

const mockCatalog: vi.Mocked<CatalogApi> = {
  getEntities: vi.fn(),
  updateLocation: vi.fn(),
};

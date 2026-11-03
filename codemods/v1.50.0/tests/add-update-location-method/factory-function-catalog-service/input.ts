import { CatalogService } from '@backstage/plugin-catalog-node';

function createService(): CatalogService {
  return {
    getEntities: async () => [],
  };
}

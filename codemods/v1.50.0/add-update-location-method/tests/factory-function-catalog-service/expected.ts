import { CatalogService } from '@backstage/plugin-catalog-node';

function createService(): CatalogService {
  return {
    getEntities: async () => [],
    updateLocation: async () => { throw new Error('updateLocation not implemented'); },
  };
}

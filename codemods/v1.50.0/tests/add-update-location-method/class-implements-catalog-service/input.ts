import { CatalogService, CatalogServiceRequestOptions } from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';

class MyCatalogService implements CatalogService {
  async getEntities(): Promise<Entity[]> {
    return [];
  }
}

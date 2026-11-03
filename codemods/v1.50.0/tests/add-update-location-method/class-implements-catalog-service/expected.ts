import { CatalogService, CatalogServiceRequestOptions } from '@backstage/plugin-catalog-node';
import { Entity, Location } from '@backstage/catalog-model';

class MyCatalogService implements CatalogService {
  async getEntities(): Promise<Entity[]> {
    return [];
  }

  async updateLocation(
    id: string,
    location: { type?: string; target: string },
    options: CatalogServiceRequestOptions,
  ): Promise<Location> {
    throw new Error('updateLocation not implemented'); // TODO(backstage-codemod): implement updateLocation
  }
}

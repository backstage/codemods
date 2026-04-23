import { CatalogApi as MyCatalog , CatalogRequestOptions} from '@backstage/catalog-client';
import { Entity , Location} from '@backstage/catalog-model';

class MyCatalogClient implements MyCatalog {
  async getEntities(): Promise<Entity[]> {
    return [];
  }

  async getEntityByRef(): Promise<Entity | undefined> {
    return undefined;
  }

  async updateLocation(
    id: string,
    location: { type?: string; target: string },
    options?: CatalogRequestOptions,
  ): Promise<Location> {
    throw new Error('updateLocation not implemented'); // TODO(backstage-codemod): implement updateLocation
  }
}

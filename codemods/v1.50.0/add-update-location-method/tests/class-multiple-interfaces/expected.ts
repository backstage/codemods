import { CatalogApi, CatalogRequestOptions } from '@backstage/catalog-client';
import { Entity , Location} from '@backstage/catalog-model';

interface Disposable {
  dispose(): void;
}

class MyCatalogClient implements Disposable, CatalogApi {
  async getEntities(): Promise<Entity[]> {
    return [];
  }

  dispose(): void {
    // cleanup
  }

  async updateLocation(
    id: string,
    location: { type?: string; target: string },
    options?: CatalogRequestOptions,
  ): Promise<Location> {
    throw new Error('updateLocation not implemented'); // TODO(backstage-codemod): implement updateLocation
  }
}

import { CatalogApi, CatalogRequestOptions } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';

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
}

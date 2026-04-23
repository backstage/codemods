import { CatalogApi, CatalogRequestOptions } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';

class MyCatalogClient implements CatalogApi {
  async getEntities(): Promise<Entity[]> {
    return [];
  }

  async getEntityByRef(): Promise<Entity | undefined> {
    return undefined;
  }
}

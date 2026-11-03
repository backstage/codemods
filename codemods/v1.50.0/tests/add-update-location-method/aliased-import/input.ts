import { CatalogApi as MyCatalog } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';

class MyCatalogClient implements MyCatalog {
  async getEntities(): Promise<Entity[]> {
    return [];
  }

  async getEntityByRef(): Promise<Entity | undefined> {
    return undefined;
  }
}

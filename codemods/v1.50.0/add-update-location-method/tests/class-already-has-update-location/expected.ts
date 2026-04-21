import { CatalogApi, CatalogRequestOptions } from '@backstage/catalog-client';
import { Entity, Location } from '@backstage/catalog-model';

class MyCatalogClient implements CatalogApi {
  async getEntities(): Promise<Entity[]> {
    return [];
  }

  async updateLocation(
    id: string,
    location: { type?: string; target: string },
    options?: CatalogRequestOptions,
  ): Promise<Location> {
    // Already implemented
    return {} as Location;
  }
}

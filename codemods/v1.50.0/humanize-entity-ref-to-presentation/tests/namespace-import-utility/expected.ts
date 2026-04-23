import * as CatalogReact from '@backstage/plugin-catalog-react';
import { entityPresentationSnapshot } from '@backstage/plugin-catalog-react';

export function sortEntities(entities: string[]) {
  return entities.sort((a, b) =>
    entityPresentationSnapshot(a).primaryTitle.localeCompare(entityPresentationSnapshot(b).primaryTitle)
  );
}

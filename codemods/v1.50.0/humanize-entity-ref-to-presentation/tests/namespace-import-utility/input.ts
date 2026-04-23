import * as CatalogReact from '@backstage/plugin-catalog-react';

export function sortEntities(entities: string[]) {
  return entities.sort((a, b) =>
    CatalogReact.humanizeEntityRef(a).localeCompare(CatalogReact.humanizeEntityRef(b))
  );
}

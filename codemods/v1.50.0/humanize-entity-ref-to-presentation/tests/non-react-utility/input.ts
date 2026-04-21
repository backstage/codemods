import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

export function sortEntities(entities: string[]) {
  return entities.sort((a, b) =>
    humanizeEntityRef(a).localeCompare(humanizeEntityRef(b))
  );
}

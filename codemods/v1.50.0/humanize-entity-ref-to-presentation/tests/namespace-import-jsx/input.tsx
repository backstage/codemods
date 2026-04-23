import React from 'react';
import * as CatalogReact from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef }: { entityRef: string }) {
  return (
    <div>
      <Typography>{CatalogReact.humanizeEntityRef(entityRef)}</Typography>
    </div>
  );
}

import React from 'react';
import * as CatalogReact from '@backstage/plugin-catalog-react';

function EntityPage({ entityRef }: { entityRef: string }) {
  const title = CatalogReact.humanizeEntityRef(entityRef);
  return (
    <div>
      <h1>{title}</h1>
      <span>{CatalogReact.humanizeEntityRef(entityRef)}</span>
    </div>
  );
}

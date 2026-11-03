import React from 'react';
import * as CatalogReact from '@backstage/plugin-catalog-react';

function MyComponent({ entityRef }: { entityRef: string }) {
  const name = CatalogReact.humanizeEntityRef(entityRef);
  return <span>{name}</span>;
}

import React from 'react';
import * as CatalogReact from '@backstage/plugin-catalog-react';
import { useEntityPresentation } from '@backstage/plugin-catalog-react';

function MyComponent({ entityRef }: { entityRef: string }) {
  const name = useEntityPresentation(entityRef).primaryTitle;
  return <span>{name}</span>;
}

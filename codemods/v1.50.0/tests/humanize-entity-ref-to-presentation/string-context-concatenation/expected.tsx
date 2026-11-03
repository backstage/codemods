import React from 'react';
import { useEntityPresentation } from '@backstage/plugin-catalog-react';

function EntityBreadcrumb({ entityRef }: { entityRef: string }) {
  const name = useEntityPresentation(entityRef).primaryTitle;
  const label = 'Entity: ' + name;
  return <span>{label}</span>;
}

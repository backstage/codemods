import React from 'react';
import { useEntityPresentation } from '@backstage/plugin-catalog-react';

function EntityTooltip({ entityRef }: { entityRef: string }) {
  const name = useEntityPresentation(entityRef).primaryTitle;
  return <span title={`Entity: ${name}`}>{name}</span>;
}

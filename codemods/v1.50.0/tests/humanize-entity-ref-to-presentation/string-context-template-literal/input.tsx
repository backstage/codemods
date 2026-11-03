import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

function EntityTooltip({ entityRef }: { entityRef: string }) {
  const name = humanizeEntityRef(entityRef);
  return <span title={`Entity: ${name}`}>{name}</span>;
}

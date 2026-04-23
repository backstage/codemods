import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

function EntityBreadcrumb({ entityRef }: { entityRef: string }) {
  const name = humanizeEntityRef(entityRef);
  const label = 'Entity: ' + name;
  return <span>{label}</span>;
}

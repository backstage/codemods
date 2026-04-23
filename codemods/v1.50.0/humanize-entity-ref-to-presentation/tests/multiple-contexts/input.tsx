import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

function EntityPage({ entityRef }: { entityRef: string }) {
  const title = humanizeEntityRef(entityRef);
  return (
    <div>
      <h1>{title}</h1>
      <span>{humanizeEntityRef(entityRef)}</span>
    </div>
  );
}

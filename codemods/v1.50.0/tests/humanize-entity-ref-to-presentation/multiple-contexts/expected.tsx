import React from 'react';
import { useEntityPresentation, EntityDisplayName } from '@backstage/plugin-catalog-react';

function EntityPage({ entityRef }: { entityRef: string }) {
  const title = useEntityPresentation(entityRef).primaryTitle;
  return (
    <div>
      <h1>{title}</h1>
      <span><EntityDisplayName entityRef={entityRef} /></span>
    </div>
  );
}

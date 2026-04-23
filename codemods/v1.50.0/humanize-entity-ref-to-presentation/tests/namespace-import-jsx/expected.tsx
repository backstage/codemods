import React from 'react';
import * as CatalogReact from '@backstage/plugin-catalog-react';
import { EntityDisplayName } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef }: { entityRef: string }) {
  return (
    <div>
      <Typography><EntityDisplayName entityRef={entityRef} /></Typography>
    </div>
  );
}

import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

export function EntityLabel({ entityRef }: { entityRef: string }) {
  return <Chip label={`Entity: ${humanizeEntityRef(entityRef)}`} />;
}

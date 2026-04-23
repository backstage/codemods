import React from 'react';
import { entityPresentationSnapshot } from '@backstage/plugin-catalog-react';

export function EntityLabel({ entityRef }: { entityRef: string }) {
  return <Chip label={`Entity: ${entityPresentationSnapshot(entityRef).primaryTitle}`} />;
}

import React from 'react';
import { EntityDisplayName } from '@backstage/plugin-catalog-react';

export function EntityChip({ entityRef }: { entityRef: string }) {
  return <Chip label={<EntityDisplayName entityRef={entityRef} />} />;
}

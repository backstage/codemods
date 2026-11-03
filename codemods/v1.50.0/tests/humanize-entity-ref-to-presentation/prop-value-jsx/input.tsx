import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

export function EntityChip({ entityRef }: { entityRef: string }) {
  return <Chip label={humanizeEntityRef(entityRef)} />;
}

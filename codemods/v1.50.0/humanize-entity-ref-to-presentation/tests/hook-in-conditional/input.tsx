import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

function EntityCard({ entityRef, showName }: { entityRef: string; showName: boolean }) {
  let name = 'Unknown';
  if (showName) {
    name = humanizeEntityRef(entityRef);
  }
  return <span>{name}</span>;
}

import React from 'react';
import { entityPresentationSnapshot } from '@backstage/plugin-catalog-react';

function EntityCard({ entityRef, showName }: { entityRef: string; showName: boolean }) {
  let name = 'Unknown';
  if (showName) {
    name = entityPresentationSnapshot(entityRef).primaryTitle;
  }
  return <span>{name}</span>;
}

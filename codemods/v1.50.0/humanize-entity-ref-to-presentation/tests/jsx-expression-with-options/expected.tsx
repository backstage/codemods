import React from 'react';
import { EntityDisplayName } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef }: { entityRef: string }) {
  return (
    <span><EntityDisplayName entityRef={entityRef} defaultKind="Component" defaultNamespace="default" /></span>
  );
}

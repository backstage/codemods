import React from 'react';
import { EntityDisplayName } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef, myKind }: { entityRef: string; myKind: string }) {
  return (
    <span><EntityDisplayName entityRef={entityRef} defaultKind={myKind} /></span>
  );
}

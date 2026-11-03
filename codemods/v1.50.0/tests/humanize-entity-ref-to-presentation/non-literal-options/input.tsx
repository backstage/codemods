import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef, myKind }: { entityRef: string; myKind: string }) {
  return (
    <span>{humanizeEntityRef(entityRef, { defaultKind: myKind })}</span>
  );
}

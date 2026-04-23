import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef, opts }: { entityRef: string; opts: { defaultKind: string } }) {
  return (
    <span>{humanizeEntityRef(entityRef, opts)}</span>
  );
}

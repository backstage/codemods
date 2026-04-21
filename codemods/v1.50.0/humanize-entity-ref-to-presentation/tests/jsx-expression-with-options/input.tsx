import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef }: { entityRef: string }) {
  return (
    <span>{humanizeEntityRef(entityRef, { defaultKind: 'Component', defaultNamespace: 'default' })}</span>
  );
}

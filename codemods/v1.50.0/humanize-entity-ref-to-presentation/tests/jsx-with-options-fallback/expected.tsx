import React from 'react';
import { useEntityPresentation } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef }: { entityRef: string }) {
  return (
    <span>{useEntityPresentation(entityRef, { defaultKind: 'group' }).primaryTitle}</span>
  );
}

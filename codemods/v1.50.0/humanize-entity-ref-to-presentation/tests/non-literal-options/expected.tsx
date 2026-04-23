import React from 'react';
import { useEntityPresentation } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef, myKind }: { entityRef: string; myKind: string }) {
  return (
    <span>{useEntityPresentation(entityRef, { defaultKind: myKind }).primaryTitle}</span>
  );
}

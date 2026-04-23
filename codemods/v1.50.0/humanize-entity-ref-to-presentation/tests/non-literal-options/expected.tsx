import React from 'react';
import { EntityDisplayName } from '@backstage/plugin-catalog-react';

export function EntityCard({ entityRef, opts }: { entityRef: string; opts: { defaultKind: string } }) {
  return (
    <span>{/* TODO(backstage-codemod): Non-literal options (opts) could not be converted to JSX props. Manually spread or pass them. */}<EntityDisplayName entityRef={entityRef} /></span>
  );
}

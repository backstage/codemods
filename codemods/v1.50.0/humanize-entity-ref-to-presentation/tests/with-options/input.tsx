import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

function ComponentName({ entityRef }: { entityRef: string }) {
  const name = humanizeEntityRef(entityRef, { defaultKind: 'Component', defaultNamespace: 'default' });
  return <span>{name}</span>;
}

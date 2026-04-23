import React from 'react';
import { useEntityPresentation } from '@backstage/plugin-catalog-react';

function ComponentName({ entityRef }: { entityRef: string }) {
  const name = useEntityPresentation(entityRef, { defaultKind: 'Component', defaultNamespace: 'default' }).primaryTitle;
  return <span>{name}</span>;
}

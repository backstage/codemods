import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

function MyComponent({ entityRef }: { entityRef: string }) {
  const name = humanizeEntityRef(entityRef);
  return <span>{name}</span>;
}

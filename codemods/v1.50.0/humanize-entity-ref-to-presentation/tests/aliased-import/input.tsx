import React from 'react';
import { humanizeEntityRef as formatRef } from '@backstage/plugin-catalog-react';

function EntityCard({ entityRef }: { entityRef: string }) {
  return <div>{formatRef(entityRef)}</div>;
}

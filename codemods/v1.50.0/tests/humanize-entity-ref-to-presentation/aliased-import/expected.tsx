import React from 'react';
import { EntityDisplayName } from '@backstage/plugin-catalog-react';

function EntityCard({ entityRef }: { entityRef: string }) {
  return <div><EntityDisplayName entityRef={entityRef} /></div>;
}

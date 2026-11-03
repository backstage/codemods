import React from 'react';
import { useEntity, humanizeEntityRef } from '@backstage/plugin-catalog-react';

function EntityInfo() {
  const { entity } = useEntity();
  const name = humanizeEntityRef(entity);
  return <div>{name}</div>;
}

import React from 'react';
import { useEntity, useEntityPresentation } from '@backstage/plugin-catalog-react';

function EntityInfo() {
  const { entity } = useEntity();
  const name = useEntityPresentation(entity).primaryTitle;
  return <div>{name}</div>;
}

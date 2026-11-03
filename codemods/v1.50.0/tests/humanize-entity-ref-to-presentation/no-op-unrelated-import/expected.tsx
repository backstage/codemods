import React from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';

function MyComponent() {
  const { entity } = useEntity();
  return <div>{entity.metadata.name}</div>;
}

import React from 'react';
import { useEntityPresentation } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';

function EntityLabel({ entity }: { entity: Entity }) {
  const label = useEntityPresentation(entity).primaryTitle;
  return <span>{label}</span>;
}

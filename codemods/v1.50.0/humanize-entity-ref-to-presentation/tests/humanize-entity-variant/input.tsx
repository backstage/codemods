import React from 'react';
import { humanizeEntity } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';

function EntityLabel({ entity }: { entity: Entity }) {
  const label = humanizeEntity(entity, 'Unknown');
  return <span>{label}</span>;
}

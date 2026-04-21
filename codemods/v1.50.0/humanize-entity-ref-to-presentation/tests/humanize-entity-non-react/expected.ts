import { entityPresentationSnapshot } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';

export function getEntityLabel(entity: Entity): string {
  return entityPresentationSnapshot(entity).primaryTitle;
}

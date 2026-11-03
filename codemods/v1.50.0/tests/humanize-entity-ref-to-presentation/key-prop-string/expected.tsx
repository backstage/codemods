import React from 'react';
import { entityPresentationSnapshot } from '@backstage/plugin-catalog-react';

export function EntityList({ items }: { items: Array<{ entity: string }> }) {
  return (
    <ul>
      {items.map(item => (
        <ListItem key={entityPresentationSnapshot(item.entity).primaryTitle}>
          {item.entity}
        </ListItem>
      ))}
    </ul>
  );
}

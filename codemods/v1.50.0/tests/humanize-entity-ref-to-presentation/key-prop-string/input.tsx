import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

export function EntityList({ items }: { items: Array<{ entity: string }> }) {
  return (
    <ul>
      {items.map(item => (
        <ListItem key={humanizeEntityRef(item.entity)}>
          {item.entity}
        </ListItem>
      ))}
    </ul>
  );
}

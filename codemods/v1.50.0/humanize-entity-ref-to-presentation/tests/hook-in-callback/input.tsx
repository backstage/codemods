import React from 'react';
import { humanizeEntityRef } from '@backstage/plugin-catalog-react';

function EntityList({ entityRefs }: { entityRefs: string[] }) {
  const names = entityRefs.map((ref) => humanizeEntityRef(ref));
  return (
    <ul>
      {names.map((n) => (
        <li>{n}</li>
      ))}
    </ul>
  );
}

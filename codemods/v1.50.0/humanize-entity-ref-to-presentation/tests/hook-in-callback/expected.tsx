import React from 'react';
import { entityPresentationSnapshot } from '@backstage/plugin-catalog-react';

function EntityList({ entityRefs }: { entityRefs: string[] }) {
  const names = entityRefs.map((ref) => entityPresentationSnapshot(ref).primaryTitle);
  return (
    <ul>
      {names.map((n) => (
        <li>{n}</li>
      ))}
    </ul>
  );
}

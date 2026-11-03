import { RequirePermission } from '@backstage/plugin-permission-react';
import { Route } from 'react-router-dom';

const p = {} as any;

export const r = (
  <Route path="/x" caseSensitive element={<RequirePermission permission={p}><Page /></RequirePermission>} />
);

function Page() {
  return null;
}

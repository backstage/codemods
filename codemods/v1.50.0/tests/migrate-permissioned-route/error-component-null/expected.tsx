import { RequirePermission } from '@backstage/plugin-permission-react';
import { Route } from 'react-router-dom';

const p = {} as any;

export const r = (
  <Route path="/n" element={<RequirePermission permission={p} errorPage={null}><Page /></RequirePermission>} />
);

function Page() {
  return null;
}

import { RequirePermission } from '@backstage/plugin-permission-react';
import { Route } from 'react-router-dom';

const adminPermission = {} as any;

export const r = (
  <Route path="/admin" element={<RequirePermission permission={adminPermission} errorPage={<AccessDenied />}><AdminPage /></RequirePermission>} />
);

function AdminPage() {
  return null;
}
function AccessDenied() {
  return null;
}

import { PermissionedRoute } from '@backstage/plugin-permission-react';

const adminPermission = {} as any;

export const r = (
  <PermissionedRoute
    path="/admin"
    permission={adminPermission}
    element={<AdminPage />}
    errorComponent={<AccessDenied />}
  />
);

function AdminPage() {
  return null;
}
function AccessDenied() {
  return null;
}

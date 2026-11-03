import { PermissionedRoute, RequirePermission } from '@backstage/plugin-permission-react';

const p = {} as any;

export const r = (
  <PermissionedRoute
    path="/x"
    permission={p}
    element={
      <RequirePermission permission={p}>
        <Page />
      </RequirePermission>
    }
  />
);

function Page() {
  return null;
}

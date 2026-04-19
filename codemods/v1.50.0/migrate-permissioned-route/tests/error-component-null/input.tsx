import { PermissionedRoute } from '@backstage/plugin-permission-react';

const p = {} as any;

export const r = (
  <PermissionedRoute
    path="/n"
    permission={p}
    element={<Page />}
    errorComponent={null}
  />
);

function Page() {
  return null;
}

import { PermissionedRoute } from '@backstage/plugin-permission-react';

const p = {} as any;

export const r = (
  <PermissionedRoute
    path="/x"
    caseSensitive
    permission={p}
    element={<Page />}
  />
);

function Page() {
  return null;
}

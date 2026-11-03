import { PermissionedRoute as PR } from '@backstage/plugin-permission-react';

const p = {} as any;

export const r = <PR path="/z" permission={p} element={<Page />} />;

function Page() {
  return null;
}

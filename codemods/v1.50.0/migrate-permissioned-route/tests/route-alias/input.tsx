import { PermissionedRoute } from '@backstage/plugin-permission-react';
import { Route as R } from 'react-router-dom';

const p = {} as any;

export const r = (
  <PermissionedRoute path="/a" permission={p} element={<Page />} />
);

function Page() {
  return null;
}

import { PermissionedRoute } from '@backstage/plugin-permission-react';

const a = {} as any;
const b = {} as any;

export const routes = (
  <>
    <PermissionedRoute path="/a" permission={a} element={<A />} />
    <PermissionedRoute path="/b" permission={b} element={<B />} />
  </>
);

function A() {
  return null;
}
function B() {
  return null;
}

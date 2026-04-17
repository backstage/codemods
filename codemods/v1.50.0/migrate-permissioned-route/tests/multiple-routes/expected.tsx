import { RequirePermission } from '@backstage/plugin-permission-react';
import { Route } from 'react-router-dom';

const a = {} as any;
const b = {} as any;

export const routes = (
  <>
    <Route path="/a" element={<RequirePermission permission={a}><A /></RequirePermission>} />
    <Route path="/b" element={<RequirePermission permission={b}><B /></RequirePermission>} />
  </>
);

function A() {
  return null;
}
function B() {
  return null;
}

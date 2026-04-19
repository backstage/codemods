import { Route as R } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';

const p = {} as any;

export const r = (
  <R path="/a" element={<RequirePermission permission={p}><Page /></RequirePermission>} />
);

function Page() {
  return null;
}

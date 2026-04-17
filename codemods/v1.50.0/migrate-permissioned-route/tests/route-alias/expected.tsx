import { RequirePermission } from '@backstage/plugin-permission-react';
import { Route as R } from 'react-router-dom';

const p = {} as any;

export const r = (
  <R path="/a" element={<RequirePermission permission={p}><Page /></RequirePermission>} />
);

function Page() {
  return null;
}

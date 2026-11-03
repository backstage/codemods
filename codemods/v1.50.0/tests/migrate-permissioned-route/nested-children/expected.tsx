import { Route } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';

const docsPermission = {} as any;

export const tree = (
  <Route path="/docs/*" element={<RequirePermission permission={docsPermission}><DocsPage /></RequirePermission>}>
    <Route path="nested" element={<NestedPage />} />
  </Route>
);

function DocsPage() {
  return null;
}
function NestedPage() {
  return null;
}

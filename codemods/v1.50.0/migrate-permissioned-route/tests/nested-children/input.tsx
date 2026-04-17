import { PermissionedRoute } from '@backstage/plugin-permission-react';
import { Route } from 'react-router-dom';

const docsPermission = {} as any;

export const tree = (
  <PermissionedRoute
    path="/docs/*"
    permission={docsPermission}
    element={<DocsPage />}
  >
    <Route path="nested" element={<NestedPage />} />
  </PermissionedRoute>
);

function DocsPage() {
  return null;
}
function NestedPage() {
  return null;
}

import { PermissionedRoute } from '@backstage/plugin-permission-react';

const catalogEntityCreatePermission = {} as any;

export const routes = (
  <PermissionedRoute
    path="/catalog-import"
    permission={catalogEntityCreatePermission}
    element={<CatalogImportPage />}
  />
);

function CatalogImportPage() {
  return null;
}

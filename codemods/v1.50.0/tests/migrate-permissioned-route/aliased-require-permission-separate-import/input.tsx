import { PermissionedRoute, SomethingUnused } from '@backstage/plugin-permission-react';
import { RequirePermission as ReqPerm } from '@backstage/plugin-permission-react';

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
const unused: SomethingUnused = null as any;

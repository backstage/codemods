import { SomethingUnused } from '@backstage/plugin-permission-react';
import { RequirePermission as ReqPerm } from '@backstage/plugin-permission-react';
import { Route } from 'react-router-dom';

const catalogEntityCreatePermission = {} as any;

export const routes = (
  <Route path="/catalog-import" element={<ReqPerm permission={catalogEntityCreatePermission}><CatalogImportPage /></ReqPerm>} />
);

function CatalogImportPage() {
  return null;
}
const unused: SomethingUnused = null as any;

import { RequirePermission } from '@backstage/plugin-permission-react';
import { Route } from 'react-router-dom';

const catalogEntityCreatePermission = {} as any;

export const routes = (
  <Route path="/catalog-import" element={<RequirePermission permission={catalogEntityCreatePermission}><CatalogImportPage /></RequirePermission>} />
);

function CatalogImportPage() {
  return null;
}

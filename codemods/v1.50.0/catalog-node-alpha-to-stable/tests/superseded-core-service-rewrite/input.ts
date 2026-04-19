import { catalogPermissionExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { createBackendModule } from '@backstage/backend-plugin-api';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-permissions',
  register(reg) {
    reg.registerInit({
      deps: { catalog: catalogPermissionExtensionPoint },
      async init({ catalog }) {
        catalog.addPermissionRules([myRule]);
        catalog.addPermissions([myPermission]);
      },
    });
  },
});

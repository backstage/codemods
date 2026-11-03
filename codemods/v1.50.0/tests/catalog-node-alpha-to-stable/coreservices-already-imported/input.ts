import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import { catalogPermissionExtensionPoint } from '@backstage/plugin-catalog-node/alpha';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-permissions',
  register(reg) {
    reg.registerInit({
      deps: { catalog: catalogPermissionExtensionPoint },
      async init({ catalog }) {
        catalog.addPermissionRules([myRule]);
      },
    });
  },
});

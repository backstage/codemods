
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-permissions',
  register(reg) {
    reg.registerInit({
      deps: { catalog: coreServices.permissionsRegistry },
      async init({ catalog }) {
        catalog.addPermissionRules([myRule]);
        catalog.addPermissions([myPermission]);
      },
    });
  },
});

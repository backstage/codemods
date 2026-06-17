
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-permissions',
  register(reg) {
    reg.registerInit({
      deps: { perms: coreServices.permissionsRegistry },
      async init({ perms }) {
        perms.addPermissionRules([myRule]);
        perms.addPermissions([myPermission]);
      },
    });
  },
});

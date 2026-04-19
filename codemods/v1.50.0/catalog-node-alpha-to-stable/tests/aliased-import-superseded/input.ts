import { catalogPermissionExtensionPoint as catPerms } from '@backstage/plugin-catalog-node/alpha';
import { createBackendModule } from '@backstage/backend-plugin-api';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-permissions',
  register(reg) {
    reg.registerInit({
      deps: { perms: catPerms },
      async init({ perms }) {
        perms.addPermissionRules([myRule]);
        perms.addPermissions([myPermission]);
      },
    });
  },
});

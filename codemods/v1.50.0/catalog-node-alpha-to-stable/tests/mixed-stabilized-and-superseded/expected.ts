import { catalogServiceRef, catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-mixed-module',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogServiceRef,
        processing: catalogProcessingExtensionPoint,
        perms: coreServices.permissionsRegistry,
      },
      async init({ catalog, processing, perms }) {
        processing.addProcessor(new MyProcessor());
        perms.addPermissionRules([myRule]);
        perms.addPermissions([myPermission]);
      },
    });
  },
});

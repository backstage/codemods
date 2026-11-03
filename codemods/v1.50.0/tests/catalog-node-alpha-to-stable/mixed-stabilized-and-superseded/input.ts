import {
  catalogServiceRef,
  catalogProcessingExtensionPoint,
  catalogPermissionExtensionPoint,
  CatalogPermissionRuleInput,
} from '@backstage/plugin-catalog-node/alpha';
import { createBackendModule } from '@backstage/backend-plugin-api';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-mixed-module',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogServiceRef,
        processing: catalogProcessingExtensionPoint,
        perms: catalogPermissionExtensionPoint,
      },
      async init({ catalog, processing, perms }) {
        processing.addProcessor(new MyProcessor());
        perms.addPermissionRules([myRule]);
        perms.addPermissions([myPermission]);
      },
    });
  },
});

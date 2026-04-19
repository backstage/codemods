import {
  CatalogModelExtensionPoint,
  catalogModelExtensionPoint,
  catalogEntityPermissionResourceRef,
} from '@backstage/plugin-catalog-node/alpha';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-model-module',
  register(reg) {
    reg.registerInit({
      deps: { model: catalogModelExtensionPoint },
      async init({ model }) {
        // use model extension point
      },
    });
  },
});

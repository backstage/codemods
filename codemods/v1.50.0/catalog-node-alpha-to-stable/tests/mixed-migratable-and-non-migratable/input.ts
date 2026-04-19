import {
  catalogServiceRef,
  CatalogModelExtensionPoint,
  catalogModelExtensionPoint,
  catalogEntityPermissionResourceRef,
} from '@backstage/plugin-catalog-node/alpha';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-module',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogServiceRef,
        model: catalogModelExtensionPoint,
      },
      async init({ catalog, model }) {
        // use both
      },
    });
  },
});

import * as CatalogAlpha from '@backstage/plugin-catalog-node/alpha';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-module',
  register(reg) {
    reg.registerInit({
      deps: { catalog: CatalogAlpha.catalogServiceRef },
      async init({ catalog }) {
        // use catalog
      },
    });
  },
});

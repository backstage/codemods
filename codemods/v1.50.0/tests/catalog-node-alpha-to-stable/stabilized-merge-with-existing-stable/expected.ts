import { CatalogClient, catalogServiceRef } from '@backstage/plugin-catalog-node';


export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-module',
  register(reg) {
    reg.registerInit({
      deps: { catalog: catalogServiceRef },
      async init({ catalog }) {
        const client = new CatalogClient();
      },
    });
  },
});

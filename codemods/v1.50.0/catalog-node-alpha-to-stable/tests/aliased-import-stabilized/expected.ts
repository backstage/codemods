import { catalogServiceRef as catRef, catalogProcessingExtensionPoint as procEP } from '@backstage/plugin-catalog-node';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-module',
  register(reg) {
    reg.registerInit({
      deps: { catalog: catRef, processing: procEP },
      async init({ catalog, processing }) {
        processing.addProcessor(new MyProcessor());
      },
    });
  },
});

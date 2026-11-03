import {
  catalogServiceRef,
  CatalogProcessingExtensionPoint,
  catalogProcessingExtensionPoint,
  CatalogLocationsExtensionPoint,
  catalogLocationsExtensionPoint,
  CatalogAnalysisExtensionPoint,
  catalogAnalysisExtensionPoint,
} from '@backstage/plugin-catalog-node/alpha';

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-processor',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogServiceRef,
        processing: catalogProcessingExtensionPoint,
        locations: catalogLocationsExtensionPoint,
        analysis: catalogAnalysisExtensionPoint,
      },
      async init({ catalog, processing, locations, analysis }) {
        processing.addProcessor(new MyProcessor());
        locations.addLocation({ type: 'url', target: 'https://example.com' });
      },
    });
  },
});

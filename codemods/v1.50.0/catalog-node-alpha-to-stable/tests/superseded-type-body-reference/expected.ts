
import { createBackendModule , coreServices} from '@backstage/backend-plugin-api';

const rule: CatalogPermissionRuleInput = {
  name: 'my-rule',
  description: 'My custom rule',
};

export default createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-permissions',
  register(reg) {
    reg.registerInit({
      deps: { catalog: coreServices.permissionsRegistry },
      async init({ catalog }) {
        catalog.addPermissionRules([rule]);
      },
    });
  },
});

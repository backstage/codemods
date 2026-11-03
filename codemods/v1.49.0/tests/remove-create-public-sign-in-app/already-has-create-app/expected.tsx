import { createApp } from '@backstage/frontend-defaults';
import { appModulePublicSignIn } from '@backstage/plugin-app/alpha';
// TODO(backstage-codemod): Add @backstage/plugin-app as a dependency to your package.json

const publicApp = createApp({ features: [...plugins], modules: [appModulePublicSignIn] });
const mainApp = createApp({ features: [...otherPlugins] });

import { prepareSpecializedApp } from '@backstage/frontend-app-api';

// TODO(backstage-codemod): advanced.apis was removed. Reuse a finalized app via advanced.sessionState, register custom APIs with ApiBlueprint, pass config via the top-level config option. For sign-in flows render the bootstrap app and use onFinalized() instead of finalize().
const app = prepareSpecializedApp({
  features,
  advanced: {
    apis: customApis,
  },
}).finalize();

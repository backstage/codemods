import { createSpecializedApp } from '@backstage/frontend-app-api';

const app = createSpecializedApp({
  features,
  advanced: {
    apis: customApis,
  },
});

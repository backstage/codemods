import { createSpecializedApp } from '@backstage/frontend-app-api';
function local(createSpecializedApp: (x: {}) => unknown) {
  return createSpecializedApp({});
}
const app = createSpecializedApp({ features });

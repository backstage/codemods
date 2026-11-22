import { prepareSpecializedApp } from '@backstage/frontend-app-api';
function local(createSpecializedApp: (x: {}) => unknown) {
  return createSpecializedApp({});
}
const app = prepareSpecializedApp({ features }).finalize();

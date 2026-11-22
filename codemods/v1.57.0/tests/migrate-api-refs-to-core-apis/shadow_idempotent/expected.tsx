// TODO(backstage-codemod): migrate deprecated API refs to coreApis manually because the coreApis binding is shadowed.
import { configApiRef, useApi } from '@backstage/frontend-plugin-api';
// TODO(backstage-codemod): migrate this deprecated API ref re-export to coreApis manually.
export { fetchApiRef } from '@backstage/frontend-plugin-api';
function Widget(coreApis: unknown) {
  return useApi(configApiRef);
}

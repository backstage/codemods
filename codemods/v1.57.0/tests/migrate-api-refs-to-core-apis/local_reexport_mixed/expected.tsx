import {
  configApiRef as cfg,
  useApi,
  coreApis,
} from '@backstage/frontend-plugin-api';

// TODO(backstage-codemod): migrate this deprecated API ref re-export to coreApis manually.
export { cfg as legacyConfig };
// TODO(backstage-codemod): migrate this deprecated API ref re-export to coreApis manually.
export { fetchApiRef } from '@backstage/frontend-plugin-api/alpha';
export const getDiscovery = () => useApi(coreApis.discovery);
export default cfg;
const config = useApi(cfg);

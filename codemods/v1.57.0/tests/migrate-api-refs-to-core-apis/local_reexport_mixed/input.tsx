import {
  configApiRef as cfg,
  discoveryApiRef as discovery,
  useApi,
} from '@backstage/frontend-plugin-api';

export { cfg as legacyConfig };
export { fetchApiRef } from '@backstage/frontend-plugin-api/alpha';
export const getDiscovery = () => useApi(discovery);
export default cfg;
const config = useApi(cfg);

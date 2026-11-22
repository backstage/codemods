import { configApiRef as cfg, coreApis as ca, useApi } from '@backstage/frontend-plugin-api';
const x = useApi(cfg);
type ConfigRef = typeof cfg;
const obj = { cfg };
function other(cfg: string) { return cfg; }
function component(ref = cfg) {
  return <View api={cfg} value={ref} />;
}

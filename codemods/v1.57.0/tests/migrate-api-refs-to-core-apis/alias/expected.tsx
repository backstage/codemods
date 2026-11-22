import { coreApis as ca, useApi } from '@backstage/frontend-plugin-api';
const x = useApi(ca.config);
type ConfigRef = typeof ca.config;
const obj = { cfg: ca.config };
function other(cfg: string) { return cfg; }
function component(ref = ca.config) {
  return <View api={ca.config} value={ref} />;
}

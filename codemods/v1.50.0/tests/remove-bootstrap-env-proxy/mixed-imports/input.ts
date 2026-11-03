import { bootstrapEnvProxyAgents, findPaths } from '@backstage/cli-common';

bootstrapEnvProxyAgents();
const paths = findPaths(__dirname);

console.log(paths);

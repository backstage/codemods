import { bootstrapEnvProxyAgents } from '@backstage/cli-common';

bootstrapEnvProxyAgents({ noProxyCacheDuration: 5000 });

async function main() {
  // start the backend
}

main();

import * as CLI from '@backstage/cli-common';

CLI.bootstrapEnvProxyAgents({ noProxyCacheDuration: 5000 });
const paths = CLI.findPaths(__dirname);

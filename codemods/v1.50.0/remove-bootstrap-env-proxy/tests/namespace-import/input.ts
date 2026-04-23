import * as cliCommon from '@backstage/cli-common';

cliCommon.bootstrapEnvProxyAgents();
const paths = cliCommon.findPaths(__dirname);

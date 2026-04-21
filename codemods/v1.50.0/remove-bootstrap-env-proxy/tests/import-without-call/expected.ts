// TODO(backstage-codemod): Set NODE_USE_ENV_PROXY=1 in your environment alongside HTTP_PROXY/HTTPS_PROXY
import { findPaths } from '@backstage/cli-common';

const paths = findPaths(__dirname);
console.log(paths);

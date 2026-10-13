import { connectionTypes } from '@backstage/connections';
import { buildConnectionsFromConfig } from '@backstage/connections/config';

const build = buildConnectionsFromConfig;
const types = connectionTypes;

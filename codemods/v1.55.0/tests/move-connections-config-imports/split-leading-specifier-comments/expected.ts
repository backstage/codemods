import { connectionTypes } from '@backstage/connections';
import {
  // Moved configuration binding
  buildConnectionsFromConfig,
} from '@backstage/connections/config';
export { connectionTypes } from '@backstage/connections';
export { /* Moved re-export */ ConfiguredConnection } from '@backstage/connections/config';

void buildConnectionsFromConfig;
void connectionTypes;

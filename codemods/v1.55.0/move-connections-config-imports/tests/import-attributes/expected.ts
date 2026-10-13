import type { ConfiguredConnection } from '@backstage/connections/config' with { 'resolution-mode': 'require' };
import { connectionTypes } from '@backstage/connections' with { type: 'json' };
import { buildConnectionsFromConfig } from '@backstage/connections/config' with { type: 'json' };
import { ConfiguredConnectionAuth } from '@backstage/connections/config' assert { type: 'json' };

void ConfiguredConnectionAuth;
void (null as unknown as ConfiguredConnection);
void connectionTypes;
void buildConnectionsFromConfig;

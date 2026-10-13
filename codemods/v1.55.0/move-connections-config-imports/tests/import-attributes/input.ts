import type { ConfiguredConnection } from '@backstage/connections' with { 'resolution-mode': 'require' };
import { connectionTypes, buildConnectionsFromConfig } from '@backstage/connections' with { type: 'json' };
import { ConfiguredConnectionAuth } from '@backstage/connections' assert { type: 'json' };

void ConfiguredConnectionAuth;
void (null as unknown as ConfiguredConnection);
void connectionTypes;
void buildConnectionsFromConfig;

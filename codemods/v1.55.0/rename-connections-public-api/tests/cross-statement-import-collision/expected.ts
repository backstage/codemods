import { ConnectionAuth as ConnectionAuthValue } from '@backstage/connections';
import { ConnectionAuth } from './types';
import { ConnectionLookupStrategy } from '@backstage/connections';

type LegacyAuth = ConnectionAuthValue;
type SharedAuth = ConnectionAuth;
type LegacyLookup = ConnectionLookupStrategy;

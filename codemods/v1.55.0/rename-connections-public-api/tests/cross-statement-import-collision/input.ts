import { ConnectionAuthValue } from '@backstage/connections';
import { ConnectionAuth } from './types';
import { LookupStrategy } from '@backstage/connections';

type LegacyAuth = ConnectionAuthValue;
type SharedAuth = ConnectionAuth;
type LegacyLookup = LookupStrategy;

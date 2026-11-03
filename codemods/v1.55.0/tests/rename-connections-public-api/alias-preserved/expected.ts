import { ConnectionAuth as LegacyAuth, ConnectionLookupStrategy as LegacyLookup } from '@backstage/connections';

const lookup = (strategy: LegacyLookup): LegacyAuth | undefined => {
  return undefined;
};

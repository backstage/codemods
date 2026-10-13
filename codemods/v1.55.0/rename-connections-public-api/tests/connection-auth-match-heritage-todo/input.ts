import type { ConnectionAuthMatch } from '@backstage/connections';

interface MatchExtension extends ConnectionAuthMatch {}

class MatchImplementation implements ConnectionAuthMatch {
  plugins = ['example'];
}

type MatchAlias = ConnectionAuthMatch;

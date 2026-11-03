import type { ConnectionAuthMatch /* TODO(backstage-codemod): ConnectionAuthMatch was removed in @backstage/connections@0.4.0; inline as { plugins: string[] } manually. */ } from '@backstage/connections';

interface MatchExtension extends ConnectionAuthMatch {}

class MatchImplementation implements ConnectionAuthMatch {
  plugins = ['example'];
}

type MatchAlias = ConnectionAuthMatch;

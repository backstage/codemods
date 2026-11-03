import type { RootConnectionAuth /* preserve */, /* following */ ConfiguredConnectionAuth } from '@backstage/connections';
export type { ConfiguredConnectionAuth, /* preceding */ RootConnectionAuth } from '@backstage/connections';
type Auth = RootConnectionAuth<string>;

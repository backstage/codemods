import type { ConfiguredConnectionAuth } from '@backstage/connections';
type First = ConfiguredConnectionAuth<string>;
type Shadowed<RootConnectionAuth> = RootConnectionAuth;
function accepts<RootConnectionAuth>(auth: RootConnectionAuth): RootConnectionAuth {
  return auth;
}

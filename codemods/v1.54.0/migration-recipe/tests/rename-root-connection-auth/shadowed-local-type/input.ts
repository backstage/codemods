import type { RootConnectionAuth } from '@backstage/connections';
type First = RootConnectionAuth<string>;
type Shadowed<RootConnectionAuth> = RootConnectionAuth;
function accepts<RootConnectionAuth>(auth: RootConnectionAuth): RootConnectionAuth {
  return auth;
}

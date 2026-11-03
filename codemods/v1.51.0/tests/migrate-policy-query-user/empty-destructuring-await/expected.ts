import { PolicyQueryUser } from '@backstage/plugin-permission-node';

async function example() {
  await fetchUser();
  // TODO(backstage-codemod): migrate to credentials via coreServices.auth
}

async function fetchUser(): Promise<PolicyQueryUser> {
  return {} as PolicyQueryUser;
}

async function doSomething(_token: string) {}

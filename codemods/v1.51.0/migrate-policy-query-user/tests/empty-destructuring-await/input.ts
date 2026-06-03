import { PolicyQueryUser } from '@backstage/plugin-permission-node';

async function example() {
  const { token }: PolicyQueryUser = await fetchUser();
  await doSomething(token);
}

async function fetchUser(): Promise<PolicyQueryUser> {
  return {} as PolicyQueryUser;
}

async function doSomething(_token: string) {}

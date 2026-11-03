import {
  AuthorizeResult,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';

class CustomPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    { token, identity, credentials }: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const sub = identity.userEntityRef;
    await validateToken(token);
    return { result: AuthorizeResult.ALLOW };
  }
}

async function validateToken(_token: string) {}

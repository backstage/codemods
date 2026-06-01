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
    { info, credentials }: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const sub = info.userEntityRef;
        // TODO(backstage-codemod): migrate to credentials via coreServices.auth
    return { result: AuthorizeResult.ALLOW };
  }
}

async function validateToken(_token: string) {}

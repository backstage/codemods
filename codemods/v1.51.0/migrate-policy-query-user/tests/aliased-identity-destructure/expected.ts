import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';

class CustomPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    { info: userIdentity, credentials }: PolicyQueryUser,
  ) {
    return userIdentity.userEntityRef;
  }
}

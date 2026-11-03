import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';

class CustomPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    { identity: userIdentity, credentials }: PolicyQueryUser,
  ) {
    return userIdentity.userEntityRef;
  }
}

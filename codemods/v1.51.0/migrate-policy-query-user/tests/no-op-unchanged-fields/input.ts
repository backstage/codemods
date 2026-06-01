import { PermissionPolicy, PolicyQuery } from '@backstage/plugin-permission-node';

class CustomPermissionPolicy implements PermissionPolicy {
  async handle(request: PolicyQuery) {
    return { result: 'ALLOW' };
  }
}

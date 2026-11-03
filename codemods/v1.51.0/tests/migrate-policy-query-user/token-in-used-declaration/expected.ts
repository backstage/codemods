import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';

interface TaskSecrets {
  backstageToken: string;
  otherSecret: string;
}

class CustomPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    { credentials }: PolicyQueryUser,
  ) {
    // TODO(backstage-codemod): migrate to credentials via coreServices.auth
    const secrets: TaskSecrets = {
      backstageToken: token,
      otherSecret: 'foo',
    };

    await this.retryTask({ secrets, taskId: '123' });
    return { result: 'ALLOW' };
  }

  async retryTask(_opts: { secrets: TaskSecrets; taskId: string }) {}
}

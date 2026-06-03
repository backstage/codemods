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
    { token, credentials }: PolicyQueryUser,
  ) {
    const secrets: TaskSecrets = {
      backstageToken: token,
      otherSecret: 'foo',
    };

    await this.retryTask({ secrets, taskId: '123' });
    return { result: 'ALLOW' };
  }

  async retryTask(_opts: { secrets: TaskSecrets; taskId: string }) {}
}

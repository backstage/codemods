import { PolicyQueryUser } from '@backstage/plugin-permission-node';

export function createMockUser(): PolicyQueryUser {
  return {
    token: 'mock-token',
    expiresInSeconds: 3600,
    identity: {
      type: 'user',
      userEntityRef: 'user:default/guest',
      ownershipEntityRefs: ['user:default/guest'],
    },
    credentials: { $$type: '@backstage/BackstageCredentials', principal: {} },
    info: {
      userEntityRef: 'user:default/guest',
      ownershipEntityRefs: ['user:default/guest'],
    },
  };
}

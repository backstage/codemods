import { PolicyQueryUser } from '@backstage/plugin-permission-node';

export function createMockUser(): PolicyQueryUser {
  return {
    credentials: { $$type: '@backstage/BackstageCredentials', principal: {} },
    info: {
      userEntityRef: 'user:default/guest',
      ownershipEntityRefs: ['user:default/guest'],
    },
  };
}

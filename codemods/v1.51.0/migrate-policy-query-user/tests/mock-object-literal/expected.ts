import { PolicyQueryUser } from '@backstage/plugin-permission-node';

export function createMockUser(): PolicyQueryUser {
  return {
    type: 'user',
    userEntityRef: 'user:default/guest',
    ownershipEntityRefs: ['user:default/guest'],
    credentials: { $$type: '@backstage/BackstageCredentials', principal: {} },
    $$type: '@backstage/BackstageCredentials',
    principal: {},
    info: {
      userEntityRef: 'user:default/guest',
      ownershipEntityRefs: ['user:default/guest'],
    },
    userEntityRef: 'user:default/guest',
    ownershipEntityRefs: ['user:default/guest'],
    };
}

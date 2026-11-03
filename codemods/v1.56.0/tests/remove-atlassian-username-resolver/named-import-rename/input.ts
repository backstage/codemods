import { usernameMatchingUserEntityName } from '@backstage/plugin-auth-backend-module-atlassian-provider';

export const auth = {
  providers: {
    atlassian: {
      signIn: {
        resolver: usernameMatchingUserEntityName,
      },
    },
  },
};

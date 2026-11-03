import * as atlassianSignInResolvers from '@backstage/plugin-auth-backend-module-atlassian-provider';

export const auth = {
  providers: {
    atlassian: {
      signIn: {
        resolver: atlassianSignInResolvers.usernameMatchingUserEntityName,
      },
    },
  },
};

export const fallback = atlassianSignInResolvers.emailMatchingUserEntityProfileEmail;

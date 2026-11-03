import { atlassianSignInResolvers } from './local-resolvers';

export const auth = {
  providers: {
    atlassian: {
      signIn: {
        resolver: atlassianSignInResolvers.usernameMatchingUserEntityName,
      },
    },
  },
};

import * as atlassianSignInResolvers from '@backstage/plugin-auth-backend-module-atlassian-provider';
import { emailLocalPartMatchingUserEntityName } from '@backstage/plugin-auth-backend-module-atlassian-provider';

export const auth = {
  providers: {
    atlassian: {
      signIn: {
        // TODO(backstage-codemod): consider emailMatchingUserEntityProfileEmail instead
        resolver: emailLocalPartMatchingUserEntityName,
      },
    },
  },
};

export const fallback = atlassianSignInResolvers.emailMatchingUserEntityProfileEmail;

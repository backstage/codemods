import { createGitlabTokenValidator } from '@backstage/plugin-events-backend-module-gitlab';

function make(createGitlabTokenValidator: any) {
  return createGitlabTokenValidator(env.config);
}

import { createGitlabTokenValidator } from '@backstage/plugin-events-backend-module-gitlab';

const validator = createGitlabTokenValidator(env.config);

import { createGitlabTokenValidator as validator } from '@backstage/plugin-events-backend-module-gitlab';

const v = validator(env.config);

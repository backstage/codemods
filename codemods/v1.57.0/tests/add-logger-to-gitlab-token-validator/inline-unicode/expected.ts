import { createGitlabTokenValidator } from '@backstage/plugin-events-backend-module-gitlab';

function make(config: Config) {
  // TODO(backstage-codemod): createGitlabTokenValidator now requires a LoggerService as its second argument.
  if (ok) { /* 🚀 */ return createGitlabTokenValidator(config); }
}

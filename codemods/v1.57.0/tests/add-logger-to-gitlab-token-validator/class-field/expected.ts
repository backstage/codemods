import { createGitlabTokenValidator } from '@backstage/plugin-events-backend-module-gitlab';

class Ingress {
  // TODO(backstage-codemod): createGitlabTokenValidator now requires a LoggerService as its second argument.
  private validator = createGitlabTokenValidator(config);
}
export class ExportedIngress {
  // TODO(backstage-codemod): createGitlabTokenValidator now requires a LoggerService as its second argument.
  validator = createGitlabTokenValidator(config);
}

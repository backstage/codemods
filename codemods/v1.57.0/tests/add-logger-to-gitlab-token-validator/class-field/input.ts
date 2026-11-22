import { createGitlabTokenValidator } from '@backstage/plugin-events-backend-module-gitlab';

class Ingress {
  private validator = createGitlabTokenValidator(config);
}
export class ExportedIngress {
  validator = createGitlabTokenValidator(config);
}

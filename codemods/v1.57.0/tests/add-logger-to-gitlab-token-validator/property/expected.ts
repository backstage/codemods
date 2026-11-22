import { createGitlabTokenValidator } from '@backstage/plugin-events-backend-module-gitlab';

async function init({ config, events }: Deps) {
  events.addHttpPostIngress({
    topic: 'gitlab',
    // TODO(backstage-codemod): createGitlabTokenValidator now requires a LoggerService as its second argument.
    validator: createGitlabTokenValidator(config),
  });
}

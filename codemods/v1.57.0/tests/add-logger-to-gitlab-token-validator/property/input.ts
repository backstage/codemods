import { createGitlabTokenValidator } from '@backstage/plugin-events-backend-module-gitlab';

async function init({ config, events }: Deps) {
  events.addHttpPostIngress({
    topic: 'gitlab',
    validator: createGitlabTokenValidator(config),
  });
}

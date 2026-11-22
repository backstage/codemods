import { createGitlabTokenValidator } from '@backstage/plugin-events-backend-module-gitlab';

env.registerInit({
  deps: { config: coreServices.rootConfig, logger: coreServices.logger },
  async init({ config, logger }) {
    const validator = createGitlabTokenValidator(config, logger);
  },
});

function make(config: Config) {
  const logger = makeLogger();
  return createGitlabTokenValidator(config, logger);
}

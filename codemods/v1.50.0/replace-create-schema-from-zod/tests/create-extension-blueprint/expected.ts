import { createExtensionBlueprint } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';

const myBlueprint = createExtensionBlueprint({
  kind: 'page',
  name: 'my-page',
  configSchema: {
    path: z.string().default('/my-page'),
  },
  *createExtensionDataRefs(params) {
    yield coreExtensionData.reactElement(params.config.path);
  },
});

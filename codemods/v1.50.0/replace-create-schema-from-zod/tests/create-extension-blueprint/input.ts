import { createSchemaFromZod, createExtensionBlueprint } from '@backstage/frontend-plugin-api';
import { z } from 'zod';

const myBlueprint = createExtensionBlueprint({
  kind: 'page',
  name: 'my-page',
  config: {
    schema: createSchemaFromZod(z =>
      z.object({
        path: z.string().default('/my-page'),
      }),
    ),
  },
  *createExtensionDataRefs(params) {
    yield coreExtensionData.reactElement(params.config.path);
  },
});

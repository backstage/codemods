import { createExtensionBlueprint } from '@backstage/frontend-plugin-api';

createExtensionBlueprint({
  name: 'column-blueprint',
  config: {
    schema: {
      attachTo: z => z.array(z.union([z.string(), z.object({ tab: z.string(), multi: z.boolean().optional() })])),
    },
  },
});

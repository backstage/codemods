import { createExtensionBlueprint } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';

createExtensionBlueprint({
  name: 'column-blueprint',
  configSchema: {
    attachTo: z.array(z.union([z.string(), z.object({ tab: z.string(), multi: z.boolean().optional() })])),
  },
});

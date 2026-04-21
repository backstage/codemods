import { createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';

const ext = MyBlueprint.override({
  configSchema: {
    title: z.string().default('Override'),
    enabled: z.boolean().default(true),
  },
});

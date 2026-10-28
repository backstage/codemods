import { createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';
createExtension({
  config: {
    other: 1,
  }, configSchema: {
      // Keep this validation comment
      route: z.string().min(1),
    },
});

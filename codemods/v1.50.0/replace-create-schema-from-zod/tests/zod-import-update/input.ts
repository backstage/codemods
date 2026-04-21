import { createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod';

createExtension({
  name: 'my-extension',
  config: {
    schema: {
      title: z => z.string().default('Hello'),
    },
  },
});

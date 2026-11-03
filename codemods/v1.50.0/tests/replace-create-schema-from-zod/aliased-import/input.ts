import { createSchemaFromZod as schemaFromZod, createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod';

createExtension({
  name: 'my-extension',
  config: {
    schema: schemaFromZod(z =>
      z.object({
        title: z.string().default('Hello'),
      }),
    ),
  },
});

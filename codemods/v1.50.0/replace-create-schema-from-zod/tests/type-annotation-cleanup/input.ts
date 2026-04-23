import { createExtension, createSchemaFromZod } from '@backstage/frontend-plugin-api';
import { z } from 'zod';

type MySchema = ReturnType<typeof createSchemaFromZod>;

const ext = createExtension({
  name: 'my-extension',
  config: {
    schema: createSchemaFromZod(z =>
      z.object({
        title: z.string().default('Hello'),
      }),
    ),
  },
});

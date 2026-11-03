import { createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';

// TODO: createSchemaFromZod was removed - update this type annotation
type MySchema = ReturnType<typeof createSchemaFromZod>;

const ext = createExtension({
  name: 'my-extension',
  configSchema: {
    title: z.string().default('Hello'),
  },
});

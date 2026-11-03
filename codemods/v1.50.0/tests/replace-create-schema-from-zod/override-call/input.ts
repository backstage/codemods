import { createSchemaFromZod } from '@backstage/frontend-plugin-api';
import { z } from 'zod';

const overridden = MyBlueprint.make({
  config: {
    schema: createSchemaFromZod(z =>
      z.object({
        title: z.string().default('Override'),
      }),
    ),
  },
});

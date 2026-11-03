import { createSchemaFromZod, createExtension, useRouteRef } from '@backstage/frontend-plugin-api';
import { z } from 'zod';

createExtension({
  name: 'my-extension',
  config: {
    schema: createSchemaFromZod(z =>
      z.object({
        title: z.string(),
      }),
    ),
  },
});

const ref = useRouteRef();

import { createExtension, useRouteRef } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';

createExtension({
  name: 'my-extension',
  configSchema: {
    title: z.string(),
  },
});

const ref = useRouteRef();

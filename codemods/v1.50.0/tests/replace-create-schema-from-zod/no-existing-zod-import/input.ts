import { createExtension } from '@backstage/frontend-plugin-api';

createExtension({
  name: 'my-extension',
  config: {
    schema: {
      title: z => z.string().default('Hello'),
    },
  },
});

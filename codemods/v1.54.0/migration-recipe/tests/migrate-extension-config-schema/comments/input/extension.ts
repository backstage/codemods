import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({
  config: {
    schema: {
      // Keep this validation comment
      route: schema => schema.string().min(1),
    },
    other: 1,
  },
});

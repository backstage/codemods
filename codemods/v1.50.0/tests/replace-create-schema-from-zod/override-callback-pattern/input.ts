import { createExtension } from '@backstage/frontend-plugin-api';

const ext = MyBlueprint.override({
  config: {
    schema: {
      title: z => z.string().default('Override'),
      enabled: z => z.boolean().default(true),
    },
  },
});

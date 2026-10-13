import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ config: { schema: { ...otherSchemas, value: z => z.string() } } });

import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ config: { schema: { name: z => z.string() } } });

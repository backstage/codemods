import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ config: { schema: { value: z => z.string() } } });

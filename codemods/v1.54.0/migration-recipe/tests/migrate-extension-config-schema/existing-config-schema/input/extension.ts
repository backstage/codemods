import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ configSchema: { existing: true }, config: { schema: { value: z => z.string() } } });

import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ config: { schema: { first: z => z.string() } }, config: { schema: { second: z => z.string() } } });

import { createExtension } from '@backstage/frontend-plugin-api';
const backstageZodV4 = 42;
createExtension({ config: { schema: { first: z => z.string() } } });

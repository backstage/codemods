import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ config: { schema: { foo: z => z.string() } } });

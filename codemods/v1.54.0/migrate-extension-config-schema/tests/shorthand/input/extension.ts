import { createExtension } from '@backstage/frontend-plugin-api';
const foo = 1;
createExtension({ config: { schema: { value: z => z.object({ foo }) } } });

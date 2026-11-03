import { createExtension } from '@backstage/frontend-plugin-api';
const defaultValue = 'bar';
createExtension({ config: { schema: { value: z => z.string().default(defaultValue) } } });

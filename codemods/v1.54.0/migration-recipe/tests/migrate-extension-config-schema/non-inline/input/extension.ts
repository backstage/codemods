import { createExtension } from '@backstage/frontend-plugin-api';
const fieldSchema = z => z.string();
createExtension({ config: { schema: { value: fieldSchema } } });

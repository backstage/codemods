import { createExtension } from '@backstage/frontend-plugin-api';
const fieldSchema = z => z.string();
createExtension({ /* TODO(backstage-codemod): non-inline schema factory; migrate to Standard Schema manually */ config: { schema: { value: fieldSchema } } });

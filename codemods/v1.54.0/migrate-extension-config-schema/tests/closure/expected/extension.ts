import { createExtension } from '@backstage/frontend-plugin-api';
const defaultValue = 'bar';
createExtension({ /* TODO(backstage-codemod): schema factory references a closure or unsupported identifier; migrate to Standard Schema manually */ config: { schema: { value: z => z.string().default(defaultValue) } } });

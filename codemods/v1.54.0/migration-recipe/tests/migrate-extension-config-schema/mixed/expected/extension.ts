import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ /* TODO(backstage-codemod): non-inline schema factory; migrate to Standard Schema manually */ config: { schema: { value: z => z.string(), other: existingSchema } } });

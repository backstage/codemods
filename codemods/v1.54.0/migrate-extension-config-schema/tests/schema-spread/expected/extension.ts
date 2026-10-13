import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ /* TODO(backstage-codemod): mixed or spread schema values; migrate to Standard Schema manually */ config: { schema: { ...otherSchemas, value: z => z.string() } } });

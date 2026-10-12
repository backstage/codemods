import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ /* TODO(backstage-codemod): package-local Zod v4 dependency not confirmed; migrate to Standard Schema manually */ config: { schema: { foo: z => z.string() } } });

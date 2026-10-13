import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ /* TODO(backstage-codemod): nested callback or closure; migrate to Standard Schema manually */ config: { schema: { value: z => z.string().transform(x => x.trim()) } } });

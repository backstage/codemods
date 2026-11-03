import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ configSchema: { existing: true }, /* TODO(backstage-codemod): existing or potentially spread configSchema; migrate to Standard Schema manually */ config: { schema: { value: z => z.string() } } });

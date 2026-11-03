import { createExtension } from '@backstage/frontend-plugin-api';
createExtension({ /* TODO(backstage-codemod): existing or potentially spread configSchema; migrate to Standard Schema manually */ config: { schema: { first: z => z.string() } }, config: { schema: { second: z => z.string() } } });

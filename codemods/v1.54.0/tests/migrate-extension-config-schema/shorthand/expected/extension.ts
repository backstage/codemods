import { createExtension } from '@backstage/frontend-plugin-api';
const foo = 1;
createExtension({ /* TODO(backstage-codemod): dynamic schema factory expression; migrate to Standard Schema manually */ config: { schema: { value: z => z.object({ foo }) } } });

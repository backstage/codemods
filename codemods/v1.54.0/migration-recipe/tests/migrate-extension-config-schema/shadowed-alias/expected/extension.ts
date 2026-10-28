import { createExtension as ext } from '@backstage/frontend-plugin-api';
function unrelated(ext: (options: unknown) => unknown) {
  ext({ config: { schema: { foo: z => z.string() } } });
}

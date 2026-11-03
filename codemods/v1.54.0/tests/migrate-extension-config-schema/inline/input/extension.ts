import { createExtension } from '@backstage/frontend-plugin-api';

createExtension({
  attachTo: { id: 'root', input: 'default' },
  config: { schema: { foo: z => z.string().default('bar'), count: validator => validator.number().optional() } },
  factory({ config }) { return config.foo; },
});

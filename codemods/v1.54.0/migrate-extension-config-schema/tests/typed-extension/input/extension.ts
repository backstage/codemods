import { createExtension, createExtensionDataRef } from '@backstage/frontend-plugin-api';
const stringDataRef = createExtensionDataRef<string>().with({ id: 'string' });
createExtension({
  attachTo: { id: 'root', input: 'default' },
  config: { schema: { foo: z => z.string().default('bar'), count: validator => validator.number().optional() } },
  output: [stringDataRef],
  factory({ config }) { const foo: string = config.foo; const count: number | undefined = config.count; return [stringDataRef(foo + count)]; },
});

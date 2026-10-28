import { createExtension, createExtensionDataRef } from '@backstage/frontend-plugin-api';
import { z as backstageZodV4 } from 'zod/v4';
const stringDataRef = createExtensionDataRef<string>().with({ id: 'string' });
createExtension({
  attachTo: { id: 'root', input: 'default' },
  configSchema: { foo: backstageZodV4.string().default('bar'), count: backstageZodV4.number().optional() },
  output: [stringDataRef],
  factory({ config }) { const foo: string = config.foo; const count: number | undefined = config.count; return [stringDataRef(foo + count)]; },
});

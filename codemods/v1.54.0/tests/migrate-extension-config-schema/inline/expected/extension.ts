import { createExtension } from '@backstage/frontend-plugin-api';
import { z as backstageZodV4 } from 'zod/v4';

createExtension({
  attachTo: { id: 'root', input: 'default' },
  configSchema: { foo: backstageZodV4.string().default('bar'), count: backstageZodV4.number().optional() },
  factory({ config }) { return config.foo; },
});

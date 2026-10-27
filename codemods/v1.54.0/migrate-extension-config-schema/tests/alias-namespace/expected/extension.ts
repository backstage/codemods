import * as api from '@backstage/frontend-plugin-api';
import { createExtension as ext } from '@backstage/frontend-plugin-api';
import { z as backstageZodV4 } from 'zod/v4';
const other = { config: { schema: { untouched: z => z.string() } } };
api.createExtension({ configSchema: { foo: backstageZodV4.object({ tab: backstageZodV4.string() }) } });
ext({ configSchema: { count: backstageZodV4.number().min(1) } });

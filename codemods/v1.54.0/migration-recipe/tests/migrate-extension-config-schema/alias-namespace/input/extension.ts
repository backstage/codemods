import * as api from '@backstage/frontend-plugin-api';
import { createExtension as ext } from '@backstage/frontend-plugin-api';
const other = { config: { schema: { untouched: z => z.string() } } };
api.createExtension({ config: { schema: { foo: builder => builder.object({ tab: builder.string() }) } } });
ext({ config: { schema: { count: schema => schema.number().min(1) } } });

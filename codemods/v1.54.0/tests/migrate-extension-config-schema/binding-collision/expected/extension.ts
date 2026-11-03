import { createExtension } from '@backstage/frontend-plugin-api';
import { z as backstageZodV42 } from 'zod/v4';
const backstageZodV4 = 42;
createExtension({ configSchema: { first: backstageZodV42.string() } });

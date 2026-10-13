import { createExtension } from '@backstage/frontend-plugin-api';
import { z as backstageZodV4 } from 'zod/v4';
createExtension({ configSchema: { name: backstageZodV4.string() } });

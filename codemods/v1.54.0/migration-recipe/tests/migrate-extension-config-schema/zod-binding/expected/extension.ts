import { createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';
createExtension({ configSchema: { value: z.string().email() } });

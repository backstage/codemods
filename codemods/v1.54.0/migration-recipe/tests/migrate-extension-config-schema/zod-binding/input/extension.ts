import { createExtension } from '@backstage/frontend-plugin-api';
import { z } from 'zod/v4';
createExtension({ config: { schema: { value: schema => schema.string().email() } } });

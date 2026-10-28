import { createExtensionBlueprint, PageBlueprint } from '@backstage/frontend-plugin-api';
import { z as z4 } from 'zod/v4';
const MyBlueprint = createExtensionBlueprint({ name: 'my', kind: 'my' });
MyBlueprint.override({ config: { schema: { enabled: s => s.boolean().default(true) }, other: 1 }, factory({ config }) { return config.enabled; } });
PageBlueprint.makeWithOverrides({ config: { schema: { path: schema => schema.string().optional() } }, factory({ config }) { return config.path; } });

import { createExtensionBlueprint, PageBlueprint } from '@backstage/frontend-plugin-api';
import { z as z4 } from 'zod/v4';
const MyBlueprint = createExtensionBlueprint({ name: 'my', kind: 'my' });
MyBlueprint.override({ config: { other: 1 }, configSchema: { enabled: z4.boolean().default(true) }, factory({ config }) { return config.enabled; } });
PageBlueprint.makeWithOverrides({ configSchema: { path: z4.string().optional() }, factory({ config }) { return config.path; } });

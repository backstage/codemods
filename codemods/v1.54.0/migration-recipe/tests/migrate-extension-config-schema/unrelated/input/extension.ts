import { createExtension } from '@other/api';
const MyBlueprint = { override(options: unknown) { return options; } };
createExtension({ config: { schema: { untouched: z => z.string() } } });
MyBlueprint.override({ config: { schema: { untouched: z => z.string() } } });

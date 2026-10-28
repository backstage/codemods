import { createExtensionBlueprint } from '@backstage/frontend-plugin-api';
import { z as backstageZodV4 } from 'zod/v4';
const LocalBlueprint = createExtensionBlueprint({ name: 'local', kind: 'local' });
const LocalBlueprintLabel = 'label';
const PrefixLocalBlueprintSuffix = 'suffix';
const { LocalBlueprintSuffix, label: PrefixLocalBlueprint, LocalBlueprint: alias } = labels;
const ActualBlueprint = createExtensionBlueprint({ name: 'actual', kind: 'actual' });
function actualShadow({ ActualBlueprint }: { ActualBlueprint: { override: (options: unknown) => unknown } }) {
  ActualBlueprint.override({ config: { schema: { shadow: z => z.string() } } });
}
ActualBlueprint.override({ config: { schema: { skipped: z => z.string() } } });
LocalBlueprint.override({ configSchema: { enabled: backstageZodV4.boolean() } });

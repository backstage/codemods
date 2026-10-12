import { createExtensionBlueprint } from '@backstage/frontend-plugin-api';
const LocalBlueprint = createExtensionBlueprint({ name: 'local', kind: 'local' });
const LocalBlueprintLabel = 'label';
const PrefixLocalBlueprintSuffix = 'suffix';
const { LocalBlueprintSuffix, label: PrefixLocalBlueprint, LocalBlueprint: alias } = labels;
const ActualBlueprint = createExtensionBlueprint({ name: 'actual', kind: 'actual' });
function actualShadow({ ActualBlueprint }: { ActualBlueprint: { override: (options: unknown) => unknown } }) {
  ActualBlueprint.override({ config: { schema: { shadow: z => z.string() } } });
}
ActualBlueprint.override({ config: { schema: { skipped: z => z.string() } } });
LocalBlueprint.override({ config: { schema: { enabled: z => z.boolean() } } });

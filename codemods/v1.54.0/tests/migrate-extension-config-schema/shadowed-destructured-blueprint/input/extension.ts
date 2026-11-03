import { createExtensionBlueprint } from '@backstage/frontend-plugin-api';
const LocalBlueprint = createExtensionBlueprint({ name: 'local', kind: 'local' });
function unrelatedDestructured({ LocalBlueprint }: { LocalBlueprint: { override: (options: unknown) => unknown } }) {
  LocalBlueprint.override({ config: { schema: { baz: z => z.string() } } });
}
LocalBlueprint.override({ config: { schema: { bar: z => z.string() } } });

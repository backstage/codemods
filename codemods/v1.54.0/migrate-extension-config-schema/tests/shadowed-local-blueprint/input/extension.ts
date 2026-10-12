import { createExtensionBlueprint } from '@backstage/frontend-plugin-api';
const LocalBlueprint = createExtensionBlueprint({ name: 'local', kind: 'local' });
function unrelated(LocalBlueprint: { override: (options: unknown) => unknown }) {
  LocalBlueprint.override({ config: { schema: { foo: z => z.string() } } });
}
LocalBlueprint.override({ config: { schema: { bar: z => z.string() } } });

import { createExtension } from '@backstage/frontend-plugin-api';
const oldRouter = createExtension({ attachTo: { id: 'app/root', input: 'router' }, factory() {} });
const other = createExtension({ attachTo: { id: 'app/root', input: 'elements' }, factory() {} });
// TODO(backstage-codemod): app/root no longer has a router input since 1.57. Remove this extension or move its providers to AppRootWrapperBlueprint.
const flagged = createExtension({ attachTo: { id: 'app/root', input: 'router' }, factory() {} });
const array = createExtension({ attachTo: [{ id: 'app/root', input: 'router' }] });

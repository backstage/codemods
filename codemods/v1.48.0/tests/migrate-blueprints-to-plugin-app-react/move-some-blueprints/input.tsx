import { createFrontendPlugin, ThemeBlueprint, IconBundleBlueprint } from '@backstage/frontend-plugin-api';

const plugin = createFrontendPlugin({ id: 'my-plugin' });
const theme = ThemeBlueprint.make({ params: {} });

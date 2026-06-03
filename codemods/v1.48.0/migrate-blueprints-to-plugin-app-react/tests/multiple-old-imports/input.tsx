import { createFrontendPlugin, ThemeBlueprint } from '@backstage/frontend-plugin-api';
import { IconBundleBlueprint } from '@backstage/frontend-plugin-api';

const plugin = createFrontendPlugin({ id: 'my-plugin' });
const theme = ThemeBlueprint.make({ params: {} });
const icons = IconBundleBlueprint.make({ params: {} });

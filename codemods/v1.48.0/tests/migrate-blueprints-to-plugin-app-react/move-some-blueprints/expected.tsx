import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { ThemeBlueprint, IconBundleBlueprint } from '@backstage/plugin-app-react';

const plugin = createFrontendPlugin({ id: 'my-plugin' });
const theme = ThemeBlueprint.make({ params: {} });

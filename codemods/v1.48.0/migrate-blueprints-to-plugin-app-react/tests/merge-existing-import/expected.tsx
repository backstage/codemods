import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { SomeComponent , ThemeBlueprint} from '@backstage/plugin-app-react';

const plugin = createFrontendPlugin({ id: 'my-plugin' });
const theme = ThemeBlueprint.make({ params: {} });

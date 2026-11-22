import {
  createFrontendPlugin,
  type PageTab,
  PluginWrapperBlueprint as Wrapper,
  pluginWrapperApiRef,
} from '@backstage/frontend-plugin-api';
import {
  AnalyticsImplementationBlueprint as Analytics,
  type AnalyticsImplementation,
} from '@backstage/plugin-app-react';

export const plugin = createFrontendPlugin({
  extensions: [Wrapper.make({})],
});

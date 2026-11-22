import {
  createFrontendPlugin,
  type PageTab,
} from '@backstage/frontend-plugin-api';
import {
  PluginWrapperBlueprint as Wrapper,
  pluginWrapperApiRef,
  AnalyticsImplementationBlueprint as Analytics,
  type AnalyticsImplementation,
} from '@backstage/frontend-plugin-api/alpha';

export const plugin = createFrontendPlugin({
  extensions: [Wrapper.make({})],
});

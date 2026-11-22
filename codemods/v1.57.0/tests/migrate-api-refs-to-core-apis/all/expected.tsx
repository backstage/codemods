import { coreApis } from '@backstage/frontend-plugin-api';
const deps = {
  analyticsApiRef: coreApis.analytics, appLanguageApiRef: coreApis.appLanguage, appThemeApiRef: coreApis.appTheme, appTreeApiRef: coreApis.appTree,
  configApiRef: coreApis.config, dialogApiRef: coreApis.dialog, discoveryApiRef: coreApis.discovery, errorApiRef: coreApis.error,
  featureFlagsApiRef: coreApis.featureFlags, fetchApiRef: coreApis.fetch, iconsApiRef: coreApis.icons, identityApiRef: coreApis.identity,
  routeResolutionApiRef: coreApis.routeResolution, storageApiRef: coreApis.storage, toastApiRef: coreApis.toast, translationApiRef: coreApis.translation,
  appLifecycleApiRef: coreApis.internal.appLifecycle, oauthRequestApiRef: coreApis.internal.oauthRequest, pluginHeaderActionsApiRef: coreApis.internal.pluginHeaderActions,
  pluginWrapperApiRef: coreApis.internal.pluginWrapper, swappableComponentsApiRef: coreApis.internal.swappableComponents,
};

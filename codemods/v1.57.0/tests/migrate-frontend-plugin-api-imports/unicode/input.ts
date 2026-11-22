// Plugin für Analytics — © ACME
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { PluginWrapperBlueprint } from '@backstage/frontend-plugin-api/alpha';
import { AnalyticsImplementationBlueprint } from '@backstage/frontend-plugin-api';

export const x = [createFrontendPlugin, PluginWrapperBlueprint, AnalyticsImplementationBlueprint];
const lazy = () => import('@backstage/frontend-plugin-api/alpha');

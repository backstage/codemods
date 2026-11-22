// Plugin für Analytics — © ACME
import { createFrontendPlugin, PluginWrapperBlueprint } from '@backstage/frontend-plugin-api';
import { AnalyticsImplementationBlueprint } from '@backstage/plugin-app-react';

export const x = [createFrontendPlugin, PluginWrapperBlueprint, AnalyticsImplementationBlueprint];
const lazy = () => import('@backstage/frontend-plugin-api/alpha');

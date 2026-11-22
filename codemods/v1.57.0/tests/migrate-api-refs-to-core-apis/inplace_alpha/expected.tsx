import { coreApis } from '@backstage/frontend-plugin-api';
import { makePlugin } from './plugin';

export const wrapper = coreApis.internal.pluginWrapper;

import { pluginWrapperApiRef } from '@backstage/frontend-plugin-api';
jest.mock('@backstage/frontend-plugin-api/alpha', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api/alpha'),
}));
type Alpha = typeof import('@backstage/frontend-plugin-api/alpha');
const lazy = () => import('@backstage/frontend-plugin-api/alpha');
export { pluginWrapperApiRef, lazy };

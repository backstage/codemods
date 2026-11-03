import { PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';

const routeRef = createRouteRef();

export const page = PageBlueprint.make({
  params: {
    title: 'Catalog',
    routeRef,
    path: '/catalog',
    loader: async () => null,
  },
});

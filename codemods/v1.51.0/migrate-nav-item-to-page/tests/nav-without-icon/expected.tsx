import { PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';

const routeRef = createRouteRef();

const page = PageBlueprint.make({
  params: {
    title: 'Settings',
    routeRef,
    path: '/settings',
    loader: async () => null,
  },
});

export default {
  extensions: [page],
};

import { NavItemBlueprint, PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';

const routeRef = createRouteRef();

const navItem = NavItemBlueprint.make({
  params: { title: 'Settings', routeRef },
});

const page = PageBlueprint.make({
  params: {
    routeRef,
    path: '/settings',
    loader: async () => null,
  },
});

export default {
  extensions: [navItem, page],
};

import { NavItemBlueprint, PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import DuplicateIcon from '@material-ui/icons/Star';

const sharedRouteRef = createRouteRef();

export const navItem = NavItemBlueprint.make({
  params: {
    title: 'Shared',
    icon: DuplicateIcon,
    routeRef: sharedRouteRef,
  },
});

export const pageOne = PageBlueprint.make({
  params: {
    routeRef: sharedRouteRef,
    path: '/one',
    loader: async () => null,
  },
});

export const pageTwo = PageBlueprint.make({
  params: {
    routeRef: sharedRouteRef,
    path: '/two',
    loader: async () => null,
  },
});

export default {
  extensions: [pageOne, pageTwo, navItem],
};

import { NavItemBlueprint, PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import * as Icons from '@material-ui/icons';

const routeRef = createRouteRef();

const navItem = NavItemBlueprint.make({
  params: { title: 'Home', icon: Icons.Home, routeRef },
});

const page = PageBlueprint.make({
  params: {
    routeRef,
    path: '/home',
    loader: async () => null,
  },
});

export default {
  extensions: [navItem, page],
};

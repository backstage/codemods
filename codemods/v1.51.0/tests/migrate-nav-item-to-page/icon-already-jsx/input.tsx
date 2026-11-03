import { NavItemBlueprint, PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import HomeIcon from '@material-ui/icons/Home';

const routeRef = createRouteRef();

const navItem = NavItemBlueprint.make({
  params: {
    title: 'Home',
    icon: <HomeIcon fontSize="inherit" />,
    routeRef,
  },
});

const page = PageBlueprint.make({
  params: {
    routeRef,
    path: '/home',
    loader: async () => null,
  },
});

export default {
  extensions: [page, navItem],
};

import { PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import HomeIcon from '@material-ui/icons/Home';

const routeRef = createRouteRef();

const page = PageBlueprint.make({
  params: {
    title: 'Home',
    icon: <HomeIcon fontSize="inherit" />,
    routeRef,
    path: '/home',
    loader: async () => null,
  },
});

export default {
  extensions: [page],
};

import { PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import HomeIcon from '@material-ui/icons/Home';

const routeRef = createRouteRef();

// TODO(backstage-codemod): Convert nav icon to IconElement JSX manually
const page = PageBlueprint.make({
  params: {
    title: 'Home',
    icon: HomeIcon,
    routeRef,
    path: '/home',
    loader: async () => import('./Page'),
  },
});

export default {
  extensions: [page],
};

import { PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import * as Icons from '@material-ui/icons';

const routeRef = createRouteRef();

// TODO(backstage-codemod): Convert nav icon to IconElement JSX manually
const page = PageBlueprint.make({
  params: {
    title: 'Home',
    icon: Icons.Home,
    routeRef,
    path: '/home',
    loader: async () => null,
  },
});

export default {
  extensions: [page],
};

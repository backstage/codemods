import { NavItemBlueprint, PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import ExampleIcon from '@material-ui/icons/Extension';

const routeRef = createRouteRef();

const navItem = NavItemBlueprint.make({
  params: { title: 'Example', icon: ExampleIcon, routeRef },
});

const page = PageBlueprint.make({
  params: {
    routeRef,
    path: '/example',
    loader: () => import('./Page').then(m => <m.Page />),
  },
});

export default {
  extensions: [navItem, page],
};

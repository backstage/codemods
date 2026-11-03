import { PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import ExampleIcon from '@material-ui/icons/Extension';

const routeRef = createRouteRef();

const page = PageBlueprint.make({
  params: {
    title: 'Example',
    icon: <ExampleIcon fontSize="inherit" />,
    routeRef,
    path: '/example',
    loader: () => import('./Page').then(m => <m.Page />),
  },
});

export default {
  extensions: [page],
};

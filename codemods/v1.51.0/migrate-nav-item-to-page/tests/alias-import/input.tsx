import {
  NavItemBlueprint as NavBP,
  PageBlueprint,
  createRouteRef,
} from '@backstage/frontend-plugin-api';
import DocsIcon from '@material-ui/icons/Description';

const docsRouteRef = createRouteRef();

const docsNav = NavBP.make({
  params: {
    title: 'Docs',
    icon: DocsIcon,
    routeRef: docsRouteRef,
  },
});

const docsPage = PageBlueprint.make({
  params: {
    routeRef: docsRouteRef,
    path: '/docs',
    loader: async () => null,
  },
});

export default {
  extensions: [docsPage, docsNav],
};

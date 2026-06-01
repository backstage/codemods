import {
  PageBlueprint,
  createRouteRef,
} from '@backstage/frontend-plugin-api';
import DocsIcon from '@material-ui/icons/Description';

const docsRouteRef = createRouteRef();

const docsPage = PageBlueprint.make({
  params: {    title: 'Docs',
    icon: <DocsIcon fontSize="inherit" />,

    routeRef: docsRouteRef,
    path: '/docs',
    loader: async () => null,
  },
});

export default {
  extensions: [docsPage],
};

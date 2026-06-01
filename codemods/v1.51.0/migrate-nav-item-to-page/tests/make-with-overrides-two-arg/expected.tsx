import {
  coreExtensionData,
  createExtensionInput,
  PageBlueprint,
  createRouteRef,
} from '@backstage/frontend-plugin-api';
import BuildIcon from '@material-ui/icons/Build';

const rootRouteRef = createRouteRef();

export const devToolsPage = PageBlueprint.makeWithOverrides({
  inputs: {
    pages: createExtensionInput([coreExtensionData.reactElement]),
  },
  factory(originalFactory, { inputs }) {
    return originalFactory(
      {
        icon: <BuildIcon fontSize="inherit" />,
        path: '/devtools',
        routeRef: rootRouteRef,
        title: 'DevTools',
      },
      {
        inputs: {
          pages: inputs.pages,
        },
      },
    );
  },
});

export default {
  extensions: [devToolsPage],
};

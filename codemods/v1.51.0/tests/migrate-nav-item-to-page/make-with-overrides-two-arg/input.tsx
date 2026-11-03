import {
  coreExtensionData,
  createExtensionInput,
  PageBlueprint,
  NavItemBlueprint,
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

export const devToolsNavItem = NavItemBlueprint.make({
  params: {
    title: 'DevTools',
    routeRef: rootRouteRef,
    icon: BuildIcon,
  },
});

export default {
  extensions: [devToolsPage, devToolsNavItem],
};

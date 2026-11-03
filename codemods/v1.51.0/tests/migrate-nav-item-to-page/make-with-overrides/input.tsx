import {
  createExtensionInput,
  PageBlueprint,
  NavItemBlueprint,
  createRouteRef,
} from '@backstage/frontend-plugin-api';
import SearchIcon from '@material-ui/icons/Search';

const rootRouteRef = createRouteRef();

export const searchPage = PageBlueprint.makeWithOverrides({
  inputs: {
    items: createExtensionInput([]),
  },
  factory(originalFactory) {
    return originalFactory({
      path: '/search',
      routeRef: rootRouteRef,
      loader: async () => null,
    });
  },
});

export const searchNavItem = NavItemBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    title: 'Search',
    icon: SearchIcon,
  },
});

export default {
  extensions: [searchPage, searchNavItem],
};

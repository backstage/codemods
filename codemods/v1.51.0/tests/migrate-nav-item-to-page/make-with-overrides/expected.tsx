import {
  createExtensionInput,
  PageBlueprint,
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
      title: 'Search',
      icon: <SearchIcon fontSize="inherit" />,
      path: '/search',
      routeRef: rootRouteRef,
      loader: async () => null,
    });
  },
});

export default {
  extensions: [searchPage],
};

import SearchIcon from '@material-ui/icons/Search';
import { PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';

const searchRouteRef = createRouteRef();

export const searchPage = PageBlueprint.make({
  params: {
    icon: SearchIcon,
    routeRef: searchRouteRef,
  },
});

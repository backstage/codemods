
import { PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import { RiSearchLine as SearchIcon } from '@remixicon/react';

const searchRouteRef = createRouteRef();

export const searchPage = PageBlueprint.make({
  params: {
    icon: () => <SearchIcon />,
    routeRef: searchRouteRef,
  },
});

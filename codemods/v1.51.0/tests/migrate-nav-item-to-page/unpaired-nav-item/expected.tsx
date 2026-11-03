import { NavItemBlueprint, PageBlueprint, createRouteRef } from '@backstage/frontend-plugin-api';
import SettingsIcon from '@material-ui/icons/Settings';

const routeRef = createRouteRef();
const otherRouteRef = createRouteRef();

// TODO(backstage-codemod): Migrate NavItemBlueprint — no matching PageBlueprint with the same routeRef found
export const orphanNavItem = NavItemBlueprint.make({
  params: {
    title: 'Settings',
    icon: SettingsIcon,
    routeRef,
  },
});

export const page = PageBlueprint.make({
  params: {
    routeRef: otherRouteRef,
    path: '/settings',
    loader: async () => null,
  },
});

export default {
  extensions: [page, orphanNavItem],
};

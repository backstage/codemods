import UserIcon from '@material-ui/icons/Person';
import { Home as HomeIcon } from '@mui/icons-material';
import Other from '@mui/icons-material/Settings';
import { IconBundleBlueprint as Icons } from '@backstage/plugin-app-react';

export const icons = Icons.make({
  name: 'my-icons',
  params: {
    icons: { user: UserIcon, custom: MyIcon, HomeIcon, other: Other, done: <Done /> },
  },
});

import { IconBundleBlueprint as Icons } from '@backstage/plugin-app-react';
import HomeIcon from '@mui/icons-material/Home';
export const extension = Icons.makeWithOverrides({
  name: 'custom',
  *factory(originalFactory) {
    yield* originalFactory({
      icons: {
        home: <HomeIcon fontSize="inherit" />,
        custom: <CustomIcon />,
      },
    });
  },
});

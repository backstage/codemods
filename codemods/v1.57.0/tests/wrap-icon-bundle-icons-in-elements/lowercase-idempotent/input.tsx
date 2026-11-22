import { IconBundleBlueprint } from '@backstage/plugin-app-react';

// TODO(backstage-codemod): IconBundleBlueprint icons must be elements, e.g. { user: <MyIcon /> }
export const icons = IconBundleBlueprint.make({
  params: { icons: { user: myIcon, otherIcon, good: <UserIcon /> } },
});

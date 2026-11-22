import { IconBundleBlueprint } from '@backstage/plugin-app-react';
function configure(IconBundleBlueprint: any) {
  return IconBundleBlueprint.make({ params: { icons: { user: User } } });
}

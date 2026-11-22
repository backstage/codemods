import { IconBundleBlueprint } from '@backstage/plugin-app-react';

const icons = IconBundleBlueprint.makeWithOverrides({ *factory(originalFactory) { yield* originalFactory({ icons: { a: icons.A, b: getIcon() } }); } });
const more = IconBundleBlueprint.make({ params: { icons: myIcons } });

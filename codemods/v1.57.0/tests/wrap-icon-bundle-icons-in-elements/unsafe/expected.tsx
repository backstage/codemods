import { IconBundleBlueprint } from '@backstage/plugin-app-react';

// TODO(backstage-codemod): IconBundleBlueprint icons must be elements, e.g. { user: <MyIcon /> }
const icons = IconBundleBlueprint.makeWithOverrides({ *factory(originalFactory) { yield* originalFactory({ icons: { a: icons.A, b: getIcon() } }); } });
// TODO(backstage-codemod): IconBundleBlueprint icons must be elements, e.g. { user: <MyIcon /> }
const more = IconBundleBlueprint.make({ params: { icons: myIcons } });

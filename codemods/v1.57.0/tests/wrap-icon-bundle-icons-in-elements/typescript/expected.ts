import { IconBundleBlueprint } from '@backstage/plugin-app-react';
// TODO(backstage-codemod): IconBundleBlueprint icons must be elements, e.g. { user: <MyIcon /> }
const x = IconBundleBlueprint.make({ params: { icons: { x: Foo } } });

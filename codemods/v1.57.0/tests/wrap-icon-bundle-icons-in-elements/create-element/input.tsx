import React, { createElement } from 'react';
import { IconBundleBlueprint } from '@backstage/plugin-app-react';
const ext = IconBundleBlueprint.make({ params: { icons: { user: React.createElement(UserIcon), group: createElement(Group) } } });

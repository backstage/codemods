import type { IconComponent } from '@backstage/frontend-plugin-api';

export interface Props {
  /** Icon of the extension */
  // TODO(backstage-codemod): IconComponent was removed from @backstage/frontend-plugin-api in 1.57. Use IconElement and pass <MyIcon /> instead of MyIcon (legacy code can import IconComponent from @backstage/core-plugin-api).
  icon: IconComponent;
}

export function renderIcon(icon: IconComponent) {
  return icon;
}

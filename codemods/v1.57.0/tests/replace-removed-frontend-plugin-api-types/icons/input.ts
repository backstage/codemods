import type { IconComponent } from '@backstage/frontend-plugin-api';

export interface Props {
  /** Icon of the extension */
  icon: IconComponent;
}

export function renderIcon(icon: IconComponent) {
  return icon;
}

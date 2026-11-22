// © Musée — ✨
import type { IconComponent } from '@backstage/frontend-plugin-api';
type Props = {};
// Renders the plugin’s title
// TODO(backstage-codemod): IconComponent was removed from @backstage/frontend-plugin-api in 1.57. Use IconElement and pass <MyIcon /> instead of MyIcon (legacy code can import IconComponent from @backstage/core-plugin-api).
export function Header(props: { icon: IconComponent }) {
  return null;
}

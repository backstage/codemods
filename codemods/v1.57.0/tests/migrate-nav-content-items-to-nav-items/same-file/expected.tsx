import { NavContentBlueprint } from '@backstage/plugin-app-react';
import type { NavContentComponentProps } from '@backstage/plugin-app-react';
function SidebarContent({ navItems }) {
  return navItems.rest().map(item => <Row to={item.href} text={item.title} icon={() => item.icon} />);
}
export const ext = NavContentBlueprint.make({ params: { component: SidebarContent } });
export function TypedContent({ navItems }: NavContentComponentProps) {
  return navItems.rest().map(item => <Link href={item.href}>{item.title}</Link>);
}
const existing = NavContentBlueprint.make({ params: { component: ({ navItems }) => navItems.rest().map(item => item.href) } });

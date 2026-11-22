import { NavContentBlueprint } from '@backstage/plugin-app-react';
import type { NavContentComponentProps } from '@backstage/plugin-app-react';
function SidebarContent({ items }) {
  return items.map(item => <Row to={item.to} text={item.text} icon={item.icon} />);
}
export const ext = NavContentBlueprint.make({ params: { component: SidebarContent } });
export function TypedContent({ items }: NavContentComponentProps) {
  return items.map(item => <Link href={item.to}>{item.text}</Link>);
}
const existing = NavContentBlueprint.make({ params: { component: ({ items, navItems }) => items.map(item => item.to) } });

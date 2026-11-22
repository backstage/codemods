import { NavContentBlueprint } from 'other';
import { NavContentBlueprint as RealNav } from '@backstage/plugin-app-react';
const x = NavContentBlueprint.make({ params: { component: ({ items }) => items.map(item => item.to) } });
function configure(RealNav: any) {
  return RealNav.make({ params: { component: ({ items }) => items.map(item => item.to) } });
}
const migrated = RealNav.make({ params: { component: ({ navItems }) => navItems.rest().map(item => item.href) } });

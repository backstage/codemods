import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarItem } from 'other';
// TODO(backstage-codemod): items was removed; use navItems.rest() (item.href, item.title, item.icon is an element).
const x = NavContentBlueprint.make({ params: { component: ({ navItems }) => navItems.rest().map(item => <SidebarItem {...item} />) } });
// TODO(backstage-codemod): items was removed; use navItems.rest() (item.href, item.title, item.icon is an element).
const pass = NavContentBlueprint.make({ params: { component: ({ navItems }) => <Other items={navItems.rest()} /> } });

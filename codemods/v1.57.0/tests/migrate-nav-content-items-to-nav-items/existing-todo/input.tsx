import { NavContentBlueprint } from '@backstage/plugin-app-react';
// TODO(backstage-codemod): items was removed; use navItems.rest() (item.href, item.title, item.icon is an element).
const x = NavContentBlueprint.make({ params: { component: ({ navItems }) => <Other items={navItems.rest()} /> } });

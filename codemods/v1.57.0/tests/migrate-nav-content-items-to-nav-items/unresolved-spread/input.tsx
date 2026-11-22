import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarItem } from 'other';
const x = NavContentBlueprint.make({ params: { component: ({ items }) => items.map(item => <SidebarItem {...item} />) } });
const pass = NavContentBlueprint.make({ params: { component: ({ items }) => <Other items={items} /> } });

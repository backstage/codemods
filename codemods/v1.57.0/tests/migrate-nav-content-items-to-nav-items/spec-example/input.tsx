import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarItem } from '@backstage/core-components';
export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ items }) => (
      <Sidebar>
        {items.map((item, index) => (
          <SidebarItem key={index} icon={item.icon} to={item.to} text={item.text} />
        ))}
      </Sidebar>
    ),
  },
});

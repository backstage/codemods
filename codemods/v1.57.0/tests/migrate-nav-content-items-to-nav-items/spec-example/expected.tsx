import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarItem } from '@backstage/core-components';
export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) => (
      <Sidebar>
        {navItems.rest().map((item, index) => (
          <SidebarItem key={index} icon={() => item.icon} to={item.href} text={item.title} />
        ))}
      </Sidebar>
    ),
  },
});

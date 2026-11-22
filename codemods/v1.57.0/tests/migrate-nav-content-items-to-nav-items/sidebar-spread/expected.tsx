import { compatWrapper } from '@backstage/core-compat-api';
import { Sidebar, SidebarGroup, SidebarItem, SidebarScrollWrapper } from '@backstage/core-components';
import { NavContentBlueprint } from '@backstage/plugin-app-react';

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) =>
      compatWrapper(
        <Sidebar>
          <SidebarGroup label="Plugins">
            <SidebarScrollWrapper>
              {navItems.rest().map((item, index) => (
                <SidebarItem icon={() => item.icon} to={item.href} text={item.title} key={index} />
              ))}
            </SidebarScrollWrapper>
          </SidebarGroup>
        </Sidebar>,
      ),
  },
});

import { compatWrapper } from '@backstage/core-compat-api';
import { Sidebar, SidebarGroup, SidebarItem, SidebarScrollWrapper } from '@backstage/core-components';
import { NavContentBlueprint } from '@backstage/plugin-app-react';

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ items }) =>
      compatWrapper(
        <Sidebar>
          <SidebarGroup label="Plugins">
            <SidebarScrollWrapper>
              {items.map((item, index) => (
                <SidebarItem {...item} key={index} />
              ))}
            </SidebarScrollWrapper>
          </SidebarGroup>
        </Sidebar>,
      ),
  },
});

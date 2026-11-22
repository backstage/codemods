import { NavContentBlueprint as Nav } from '@backstage/plugin-app-react';
import { SidebarItem as Item } from '@backstage/core-components';
const x = Nav.make({ params: { component: ({ navItems: entries }) => (
  <div>{entries.rest().map(item => <Item icon={() => item.icon} to={item.href} text={item.title} />)}{((item) => item.to)({ to: '/' })}</div>
) } });

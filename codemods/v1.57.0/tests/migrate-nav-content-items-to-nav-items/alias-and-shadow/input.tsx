import { NavContentBlueprint as Nav } from '@backstage/plugin-app-react';
import { SidebarItem as Item } from '@backstage/core-components';
const x = Nav.make({ params: { component: ({ items: entries }) => (
  <div>{entries.map(item => <Item {...item} />)}{((item) => item.to)({ to: '/' })}</div>
) } });

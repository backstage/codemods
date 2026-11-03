import { Menu, MenuItem, MenuSection } from '@backstage/ui';

export const Example = () => (
  <Menu>
    <MenuSection title="Actions" disabledKeys={['delete']}>
      <MenuItem key="edit">Edit</MenuItem>
      <MenuItem key="delete">Delete</MenuItem>
    </MenuSection>
  </Menu>
);

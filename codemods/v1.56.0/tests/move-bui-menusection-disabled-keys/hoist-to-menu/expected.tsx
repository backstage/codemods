import { Menu, MenuItem, MenuSection } from '@backstage/ui';

export const Example = () => (
  <Menu disabledKeys={['delete']}>
    <MenuSection title="Actions">
      <MenuItem key="edit">Edit</MenuItem>
      <MenuItem key="delete">Delete</MenuItem>
    </MenuSection>
  </Menu>
);

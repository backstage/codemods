import { MenuItem, MenuSection } from '@backstage/ui';

export const Section = () => (
  <MenuSection title="Actions" disabledKeys={['delete']}>
    <MenuItem key="edit">Edit</MenuItem>
    <MenuItem key="delete">Delete</MenuItem>
  </MenuSection>
);

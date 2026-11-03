import { MenuItem, MenuSection } from '@backstage/ui';

export const Section = () => (
  <MenuSection title="Actions">
    <MenuItem key="edit">Edit</MenuItem>
    <MenuItem key="delete" isDisabled>Delete</MenuItem>
  </MenuSection>
);

import { MenuItem, MenuSection } from '@backstage/ui';

const keys = ['delete'];

export const Section = () => (
  <div>
    <MenuSection title="Actions" disabledKeys={keys}>
      <MenuItem key="edit">Edit</MenuItem>
    </MenuSection>
  </div>
);

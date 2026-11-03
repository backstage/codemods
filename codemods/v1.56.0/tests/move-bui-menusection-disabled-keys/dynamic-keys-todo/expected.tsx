import { MenuItem, MenuSection } from '@backstage/ui';

const keys = ['delete'];

export const Section = () => (
  <div>
    {/* TODO(backstage-codemod): MenuSection no longer accepts disabledKeys; set isDisabled on the MenuItem elements or disabledKeys on the Menu. Original: disabledKeys={keys} */}
    <MenuSection title="Actions">
      <MenuItem key="edit">Edit</MenuItem>
    </MenuSection>
  </div>
);

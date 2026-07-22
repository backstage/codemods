import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<MenuIcon />} variant="tertiary" size="small" aria-label="menu" onPress={handleMenu} />
);

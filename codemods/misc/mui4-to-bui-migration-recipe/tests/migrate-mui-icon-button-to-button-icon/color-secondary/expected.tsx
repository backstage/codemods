import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<SettingsIcon />} variant="secondary" size="medium" aria-label="settings" onPress={handleSettings} />
);

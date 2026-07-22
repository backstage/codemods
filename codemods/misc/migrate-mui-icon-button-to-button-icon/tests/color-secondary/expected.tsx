import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<SettingsIcon />} variant="secondary" aria-label="settings" onPress={handleSettings} />
);

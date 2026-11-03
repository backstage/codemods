import { Switch } from '@backstage/ui';

const MyComponent = () => (
  <Switch name="darkMode" isSelected={dark} onChange={setDark} isDisabled={busy} />
);

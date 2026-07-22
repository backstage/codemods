import { Select } from '@backstage/ui';

const MyComponent = () => (
  <Select label="Theme" selectedKey="dark" options={[{ id: 'dark', label: 'Dark' }]} />
);

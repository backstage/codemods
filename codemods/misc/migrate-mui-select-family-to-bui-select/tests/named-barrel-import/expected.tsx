import { Select } from '@backstage/ui';

const MyComponent = () => (
  <Select label={"Size"} selectedKey={size} onSelectionChange={key => setSize(key as string)} options={[{ id: 'sm', label: 'Small' }, { id: 'lg', label: 'Large' }]} />
);

import { NumberField } from '@backstage/ui';

const MyComponent = () => (
  <NumberField label="Count" value={count} onChange={newValue => setCount(newValue)} />
);

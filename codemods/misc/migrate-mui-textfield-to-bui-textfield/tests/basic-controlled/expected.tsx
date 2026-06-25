import { TextField } from '@backstage/ui';

const MyComponent = () => (
  <TextField isRequired label="Title" value={value} onChange={newValue => setValue(newValue)} />
);

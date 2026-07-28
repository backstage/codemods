import { TextField } from '@backstage/ui';

const MyComponent = () => (
  <TextField label="Title" value={value} onChange={newValue => setValue(newValue)} size="medium" />
);

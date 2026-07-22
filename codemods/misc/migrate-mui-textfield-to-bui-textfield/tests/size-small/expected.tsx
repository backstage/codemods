import { TextField } from '@backstage/ui';

const MyComponent = () => (
  <TextField label="Code" size="small" value={code} onChange={newValue => setCode(newValue)} />
);

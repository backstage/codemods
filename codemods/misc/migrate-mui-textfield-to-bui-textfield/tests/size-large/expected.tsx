import { TextField } from '@backstage/ui';

const MyComponent = () => (
  <TextField label="Title" size="medium" value={title} onChange={newValue => setTitle(newValue)} />
);


import { Button, TextField } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <TextField label="Email" value={email} onChange={newValue => setEmail(newValue)} />
  </>
);

import TextField from '@material-ui/core/TextField';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <TextField label="Email" value={email} onChange={e => setEmail(e.target.value)} />
  </>
);

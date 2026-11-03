import { TextField, Button } from '@material-ui/core';

const MyComponent = () => (
  <>
    <TextField label="Title" value={value} onChange={e => setValue(e.target.value)} />
    <Button>Save</Button>
  </>
);

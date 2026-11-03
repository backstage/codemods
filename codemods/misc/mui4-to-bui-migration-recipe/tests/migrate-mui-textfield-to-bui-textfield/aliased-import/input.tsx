import { TextField as MuiTextField } from '@material-ui/core';

const MyComponent = () => (
  <MuiTextField label="Title" value={value} onChange={e => setValue(e.target.value)} />
);

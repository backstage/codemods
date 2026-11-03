import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <TextField label="Code" size="small" value={code} onChange={e => setCode(e.target.value)} />
);

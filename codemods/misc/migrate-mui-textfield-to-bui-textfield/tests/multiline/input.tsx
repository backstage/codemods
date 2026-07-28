import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <TextField label="Description" multiline rows={4} value={desc} onChange={e => setDesc(e.target.value)} />
);

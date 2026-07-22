import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <TextField label="Title" size="large" value={title} onChange={e => setTitle(e.target.value)} />
);

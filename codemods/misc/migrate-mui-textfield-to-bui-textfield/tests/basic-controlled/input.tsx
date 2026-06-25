import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <TextField
    required
    label="Title"
    value={value}
    onChange={e => setValue(e.target.value)}
  />
);

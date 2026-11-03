import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <TextField
    label="Password"
    type="password"
    value={password}
    onChange={e => setPassword(e.target.value)}
    helperText="Use a strong password"
  />
);

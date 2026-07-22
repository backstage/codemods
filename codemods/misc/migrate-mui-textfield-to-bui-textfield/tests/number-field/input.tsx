import TextField from '@material-ui/core/TextField';

const MyComponent = () => (
  <TextField label="Count" type="number" value={count} onChange={e => setCount(e.target.value)} />
);

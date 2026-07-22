import FormControl from '@material-ui/core/FormControl';
import { TextField } from '@backstage/ui';


const MyComponent = () => (
  <FormControl size="small" fullWidth>
    <TextField label="Title" value={value} onChange={newValue => setValue(newValue)} size="small" />
  </FormControl>
);

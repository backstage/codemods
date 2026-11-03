import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';

const MyComponent = ({ density }: { density: 'small' | 'medium' }) => (
  <FormControl fullWidth>
    <InputLabel>Framework</InputLabel>
    <Select size={density} value={value} onChange={e => setValue(e.target.value as string)}>
      <MenuItem value="react">React</MenuItem>
      <MenuItem value="angular">Angular</MenuItem>
    </Select>
  </FormControl>
);

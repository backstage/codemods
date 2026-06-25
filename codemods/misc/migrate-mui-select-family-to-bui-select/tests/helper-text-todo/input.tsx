import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import FormHelperText from '@material-ui/core/FormHelperText';

const MyComponent = () => (
  <FormControl>
    <InputLabel>Color</InputLabel>
    <Select value={color} onChange={e => setColor(e.target.value as string)}>
      <MenuItem value="red">Red</MenuItem>
      <MenuItem value="blue">Blue</MenuItem>
    </Select>
    <FormHelperText>Pick a color</FormHelperText>
  </FormControl>
);

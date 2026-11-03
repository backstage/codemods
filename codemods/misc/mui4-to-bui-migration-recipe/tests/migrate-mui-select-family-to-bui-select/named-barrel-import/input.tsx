import { FormControl, InputLabel, Select, MenuItem } from '@material-ui/core';

const MyComponent = () => (
  <FormControl>
    <InputLabel>Size</InputLabel>
    <Select value={size} onChange={e => setSize(e.target.value as string)}>
      <MenuItem value="sm">Small</MenuItem>
      <MenuItem value="lg">Large</MenuItem>
    </Select>
  </FormControl>
);

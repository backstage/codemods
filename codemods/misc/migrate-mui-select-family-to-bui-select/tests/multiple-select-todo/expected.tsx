import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';

const MyComponent = () => (
  <>
  {/* TODO(backstage-codemod): finish Select migration manually */}
  <FormControl>
    <InputLabel>Tags</InputLabel>
    <Select multiple value={tags} onChange={handleChange}>
      <MenuItem value="a">A</MenuItem>
      <MenuItem value="b">B</MenuItem>
    </Select>
  </FormControl>
</>
);

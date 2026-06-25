import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <FormControl>
      <InputLabel>Mode</InputLabel>
      <Select value={mode} onChange={e => setMode(e.target.value as string)}>
        <MenuItem value="auto">Auto</MenuItem>
        <MenuItem value="manual">Manual</MenuItem>
      </Select>
    </FormControl>
  </>
);

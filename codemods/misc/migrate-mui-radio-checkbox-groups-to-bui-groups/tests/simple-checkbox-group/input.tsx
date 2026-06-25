import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';

const MyComponent = () => (
  <FormGroup>
    <FormControlLabel control={<Checkbox checked={enabled} onChange={toggleEnabled} />} label="Enabled" />
    <FormControlLabel control={<Checkbox checked={visible} onChange={toggleVisible} />} label="Visible" />
  </FormGroup>
);

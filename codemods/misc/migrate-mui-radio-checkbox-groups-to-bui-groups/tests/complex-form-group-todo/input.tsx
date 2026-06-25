import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';

const MyComponent = () => (
  <FormGroup>
    <FormControlLabel control={<Checkbox checked={a} onChange={toggleA} />} label="A" />
    <span>Custom separator</span>
  </FormGroup>
);

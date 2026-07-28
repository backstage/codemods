import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';

const MyComponent = () => (
  <FormControlLabel control={<Checkbox checked={enabled} onChange={toggleEnabled} />} label="Enabled" />
);

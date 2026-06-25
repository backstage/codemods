import RadioGroup from '@material-ui/core/RadioGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Radio from '@material-ui/core/Radio';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <RadioGroup value={value} onChange={handleChange}>
      <FormControlLabel value="on" control={<Radio />} label="On" />
      <FormControlLabel value="off" control={<Radio />} label="Off" />
    </RadioGroup>
  </>
);

import RadioGroup from '@material-ui/core/RadioGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Radio from '@material-ui/core/Radio';

const MyComponent = () => (
  <RadioGroup value={value} onChange={handleChange}>
    <FormControlLabel value="a" control={<Radio />} label="Option A" />
    <FormControlLabel value="b" control={<Radio />} label="Option B" />
  </RadioGroup>
);

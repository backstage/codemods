import { RadioGroup, Radio, FormControlLabel, Button } from '@material-ui/core';

const MyComponent = () => (
  <>
    <RadioGroup value={val} onChange={setVal}>
      <FormControlLabel value="x" control={<Radio />} label="X" />
      <FormControlLabel value="y" control={<Radio />} label="Y" />
    </RadioGroup>
    <Button>Save</Button>
  </>
);
